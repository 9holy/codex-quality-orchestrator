Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Get-HookBundleHash {
  param([string]$Root)
  $records = foreach ($relative in @(
    'hooks\hooks.json',
    'hooks\inject-routing-policy.cjs',
    'hooks\enforce-agent-routing.cjs',
    'routing-policy.json',
    'references\RULE16.md'
  )) {
    $hash = (Get-FileHash -LiteralPath (Join-Path $Root $relative) -Algorithm SHA256).Hash.ToLowerInvariant()
    "$($relative.Replace('\', '/'))=$hash"
  }
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($records -join "`n"))
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

$pluginRoot = Split-Path -Parent $PSScriptRoot
$guardScript = Join-Path $pluginRoot 'scripts\config-guard.ps1'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('cqo-config-guard-' + [guid]::NewGuid().ToString('N'))
$codexHome = Join-Path $tempRoot '.codex'
$guardDir = Join-Path $codexHome '.codex-quality-orchestrator-guard'
$configPath = Join-Path $codexHome 'config.toml'
$fakeCodex = Join-Path $tempRoot 'fake-codex.ps1'
$pluginId = 'codex-quality-orchestrator@codex-quality-orchestrator'
$preId = "$pluginId`:hooks/hooks.json:pre_tool_use:0:0"
$sessionId = "$pluginId`:hooks/hooks.json:session_start:0:0"
$watchProcess = $null

try {
  New-Item -ItemType Directory -Path $guardDir -Force | Out-Null
  [IO.File]::WriteAllText($configPath, "model = `"gpt-5.6-sol`"`n", [Text.UTF8Encoding]::new($false))
  $state = [ordered]@{
    schemaVersion = 1
    pluginId = $pluginId
    marketplaceSource = 'owner/repo'
    marketplaceSourceType = 'local'
    marketplaceRef = 'main'
    pluginVersion = '0.1.3'
    installedPath = $pluginRoot
    codexCommand = $fakeCodex
    hookBundleHash = Get-HookBundleHash $pluginRoot
    trustedHooks = @(
      [ordered]@{ id=$preId; trustedHash=('sha256:' + ('a' * 64)) },
      [ordered]@{ id=$sessionId; trustedHash=('sha256:' + ('b' * 64)) }
    )
  } | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText((Join-Path $guardDir 'state.json'), $state, [Text.UTF8Encoding]::new($false))

  $fake = @'
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
$config = Join-Path $env:CODEX_HOME 'config.toml'
$text = if (Test-Path -LiteralPath $config) { Get-Content -LiteralPath $config -Raw } else { '' }
if (($Args -join ' ') -ceq 'plugin list --json') {
  if ($text.Contains('[plugins."codex-quality-orchestrator@codex-quality-orchestrator"]')) {
    '{"installed":[{"pluginId":"codex-quality-orchestrator@codex-quality-orchestrator","installed":true,"enabled":true,"version":"0.1.3","marketplaceName":"cqo-test","marketplaceSource":{"sourceType":"local","source":"owner/repo"}}]}'
  } else {
    '{"installed":[]}'
  }
  exit 0
}
if ($Args[0] -ceq 'plugin' -and $Args[1] -ceq 'marketplace') {
  if (-not [string]::IsNullOrWhiteSpace($env:CQO_TEST_FAIL_ONCE) -and
      -not (Test-Path -LiteralPath $env:CQO_TEST_FAIL_ONCE)) {
    New-Item -ItemType File -Path $env:CQO_TEST_FAIL_ONCE | Out-Null
    throw 'simulated transient marketplace failure'
  }
  '{"marketplaceName":"cqo-test"}'
  exit 0
}
if ($Args[0] -ceq 'plugin' -and $Args[1] -ceq 'add') {
  Add-Content -LiteralPath $config -Encoding UTF8 -Value "`n[plugins.`"codex-quality-orchestrator@codex-quality-orchestrator`"]`nenabled = true"
  [pscustomobject]@{ pluginId='codex-quality-orchestrator@codex-quality-orchestrator'; version='0.1.3'; installedPath=$env:CQO_TEST_PLUGIN_ROOT } | ConvertTo-Json -Compress
  exit 0
}
throw "Unexpected fake codex call: $($Args -join ' ')"
'@
  [IO.File]::WriteAllText($fakeCodex, $fake, [Text.UTF8Encoding]::new($false))
  $env:CODEX_HOME = $codexHome
  $env:CQO_TEST_PLUGIN_ROOT = $pluginRoot

  $first = ((& $guardScript -Mode Repair -CodexHome $codexHome -CodexCommand $fakeCodex) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True $first.Healthy 'First repair was not healthy'
  Assert-True $first.Repaired 'First repair did not report a change'
  Assert-True (@($first.Backups).Count -ge 2) 'First repair did not back up config.toml before CLI and Hook writes'
  $config = Get-Content -LiteralPath $configPath -Raw
  Assert-True $config.Contains($preId) 'PreToolUse trust was not restored'
  Assert-True $config.Contains($sessionId) 'SessionStart trust was not restored'
  Assert-True $config.Contains('model = "gpt-5.6-sol"') 'Append-only trust restoration replaced existing config'

  $config = $config.Replace("[hooks.state.`"$preId`"]", "[hooks.state.'$preId']")
  [IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))
  $backupCount = @(Get-ChildItem -LiteralPath $codexHome -Directory -Filter 'config.toml-*').Count
  [IO.File]::WriteAllText((Join-Path $guardDir 'repair.lock'), 'stale', [Text.UTF8Encoding]::new($false))
  $second = ((& $guardScript -Mode Repair -CodexHome $codexHome -CodexCommand $fakeCodex) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True $second.Healthy 'Second repair was not healthy'
  Assert-True (-not $second.Repaired) 'Healthy config was rewritten'
  Assert-True (@(Get-ChildItem -LiteralPath $codexHome -Directory -Filter 'config.toml-*').Count -eq $backupCount) 'Healthy repair created an unnecessary backup'

  $statePath = Join-Path $guardDir 'state.json'
  $validState = Get-Content -LiteralPath $statePath -Raw
  $tampered = $validState | ConvertFrom-Json
  $tampered.trustedHooks += [pscustomobject]@{ id='unapproved-hook'; trustedHash=('sha256:' + ('c' * 64)) }
  [IO.File]::WriteAllText($statePath, ($tampered | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
  $configHash = (Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash
  $rejected = $false
  try {
    & $guardScript -Mode Repair -CodexHome $codexHome -CodexCommand $fakeCodex | Out-Null
  } catch {
    $rejected = $true
  }
  Assert-True $rejected 'Tampered Hook trust state was accepted'
  Assert-True ((Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash -ceq $configHash) 'Rejected trust state changed config.toml'
  [IO.File]::WriteAllText($statePath, $validState, [Text.UTF8Encoding]::new($false))

  $wrongBundle = $validState | ConvertFrom-Json
  $wrongBundle.hookBundleHash = 'c' * 64
  [IO.File]::WriteAllText($statePath, ($wrongBundle | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
  $bundleRejected = $false
  try {
    & $guardScript -Mode Repair -CodexHome $codexHome -CodexCommand $fakeCodex | Out-Null
  } catch {
    $bundleRejected = $true
  }
  Assert-True $bundleRejected 'Mismatched Hook bundle was trusted'
  $mismatchStatus = ((& $guardScript -Mode Status -CodexHome $codexHome -CodexCommand $fakeCodex) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (-not $mismatchStatus.Healthy) 'Status reported a mismatched Hook bundle as healthy'
  [IO.File]::WriteAllText($statePath, $validState, [Text.UTF8Encoding]::new($false))

  [IO.File]::WriteAllText($configPath, "model = `"gpt-5.6-sol`"`n", [Text.UTF8Encoding]::new($false))
  $failMarker = Join-Path $tempRoot 'transient-failure-observed'
  $env:CQO_TEST_FAIL_ONCE = $failMarker
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$guardScript`" -Mode Watch -CodexHome `"$codexHome`" -CodexCommand `"$fakeCodex`""
  $watchProcess = Start-Process powershell.exe -ArgumentList $arguments -WindowStyle Hidden -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(35)
  $watchRecovered = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 1
    if (-not (Test-Path -LiteralPath $failMarker)) { continue }
    $watchText = Get-Content -LiteralPath $configPath -Raw
    if ($watchText.Contains($pluginId) -and $watchText.Contains($preId) -and $watchText.Contains($sessionId)) {
      $watchRecovered = $true
      break
    }
  }
  Assert-True $watchRecovered 'Watch mode did not retry after a transient repair failure'

  $pidPath = Join-Path $guardDir 'watch.pid'
  $pidRecord = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
  Assert-True ([int]$pidRecord.pid -eq $watchProcess.Id) 'Watch PID record did not identify the watcher'
  Assert-True ([long]$pidRecord.startTimeUtcTicks -eq $watchProcess.StartTime.ToUniversalTime().Ticks) 'Watch PID record was not bound to process start time'

  $startupDir = Join-Path $tempRoot 'startup'
  $guardInstall = ((& $guardScript -Mode Install -CodexHome $codexHome -CodexCommand $fakeCodex -StartupDirectory $startupDir -NoStart) -join [Environment]::NewLine) | ConvertFrom-Json
  $watchProcess.WaitForExit(5000) | Out-Null
  Assert-True $watchProcess.HasExited 'Guard upgrade did not stop the previous Watch process'
  Assert-True (-not $guardInstall.Started) 'NoStart guard upgrade started a watcher'
  $launcher = Get-Content -LiteralPath $guardInstall.Launcher -Raw
  Assert-True $launcher.Contains("-CodexCommand `"$fakeCodex`"") 'Startup launcher did not persist the resolved Codex command'
  $watchProcess = $null

  [IO.File]::WriteAllText(
    $pidPath,
    ([ordered]@{ pid=$PID; startTimeUtcTicks=0 } | ConvertTo-Json),
    [Text.UTF8Encoding]::new($false)
  )
  & $guardScript -Mode Uninstall -CodexHome $codexHome -CodexCommand $fakeCodex -StartupDirectory $startupDir | Out-Null
  Assert-True ($null -ne (Get-Process -Id $PID -ErrorAction SilentlyContinue)) 'Uninstall killed a PID-reused unrelated process'

  Write-Output 'PASS append-only repair, bound full Hook inputs, retrying Watch mode, persisted CLI path, safe Watch upgrade, PID validation, and idempotency'
} finally {
  if ($null -ne $watchProcess -and -not $watchProcess.HasExited) {
    $watchProcess | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue
  Remove-Item Env:CQO_TEST_PLUGIN_ROOT -ErrorAction SilentlyContinue
  Remove-Item Env:CQO_TEST_FAIL_ONCE -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $tempRoot) {
    $resolved = [IO.Path]::GetFullPath($tempRoot)
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $resolved.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove non-temporary path: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
