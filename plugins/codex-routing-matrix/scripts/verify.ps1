[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pluginRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $pluginRoot)
$marketplacePath = Join-Path $repoRoot '.agents/plugins/marketplace.json'
$node = (Get-Command node -ErrorAction Stop).Source
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($null -eq $pythonCommand) { $pythonCommand = Get-Command python3 -ErrorAction Stop }
$python = $pythonCommand.Source

$jsonFiles = @(
  '.codex-plugin/plugin.json',
  'routing-policy.json',
  'hooks/hooks.json'
)
foreach ($relative in $jsonFiles) {
  Get-Content -LiteralPath (Join-Path $pluginRoot $relative) -Raw -Encoding UTF8 |
    ConvertFrom-Json | Out-Null
}

$nodeFiles = @(
  'hooks/inject-routing-policy.cjs',
  'hooks/burst-mode.cjs',
  'hooks/context-window-config.cjs',
  'hooks/enforce-agent-routing.cjs',
  'hooks/continue-capacity-subagent.cjs',
  'scripts/radar-routing-evidence.cjs',
  'scripts/portable-setup.cjs',
  'tests/inject-routing-policy.test.cjs',
  'tests/routing-skill.test.cjs',
  'tests/routing-semantics.test.cjs',
  'tests/radar-routing-evidence.test.cjs',
  'tests/enforce-agent-routing.test.cjs',
  'tests/continue-capacity-subagent.test.cjs',
  'tests/burst-mode.test.cjs',
  'tests/portable-setup.test.cjs'
)
foreach ($relative in $nodeFiles) {
  & $node --check (Join-Path $pluginRoot $relative)
  if ($LASTEXITCODE -ne 0) { throw "Node syntax check failed: $relative" }
}

$powerShellFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $pluginRoot 'scripts') -Filter '*.ps1' -File
  Get-ChildItem -LiteralPath (Join-Path $pluginRoot 'tests') -Filter '*.ps1' -File
)
foreach ($file in $powerShellFiles) {
  $tokens = $null
  $parseErrors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile(
    $file.FullName,
    [ref]$tokens,
    [ref]$parseErrors
  )
  if ($parseErrors.Count -gt 0) { throw "PowerShell syntax check failed: $($file.FullName)" }
}

$runtimeSmokePath = Join-Path $pluginRoot 'scripts/runtime-smoke.ps1'

$runtimeSmokeSource = Get-Content -LiteralPath $runtimeSmokePath -Raw -Encoding UTF8
if ($runtimeSmokeSource.Contains('--dangerously-bypass-hook-trust')) {
  throw 'Runtime smoke must not bypass persisted Hook trust'
}
if ($runtimeSmokeSource.Contains('debug prompt-input')) {
  throw 'Runtime smoke must use a real host session, not debug prompt-input'
}
if (-not $runtimeSmokeSource.Contains('& $codex exec')) {
  throw 'Runtime smoke must start a real host session'
}
if (-not $runtimeSmokeSource.Contains('CQO_RUNTIME_SMOKE_PROOF_PATH')) {
  throw 'Runtime smoke must verify a host-written SessionStart proof'
}
if (-not $runtimeSmokeSource.Contains("PreToolUseHookTrust = 'NOT_VERIFIED'")) {
  throw 'Runtime smoke must not claim PreToolUse trust without a dedicated host-event probe'
}

& $python (Join-Path $pluginRoot 'tests/validate_profiles.py')
if ($LASTEXITCODE -ne 0) { throw 'Agent profile validation failed' }

$marketplaceStatus = 'SKIPPED (standalone plugin)'
if (Test-Path -LiteralPath $marketplacePath -PathType Leaf) {
  & $python (Join-Path $pluginRoot 'tests/validate_marketplace.py') $marketplacePath
  if ($LASTEXITCODE -ne 0) { throw 'Repository marketplace validation failed' }
  $marketplaceStatus = 'PASS'
}

& $node (Join-Path $pluginRoot 'tests/enforce-agent-routing.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Routing hook matrix test failed' }

& $node (Join-Path $pluginRoot 'tests/inject-routing-policy.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Session hook contract test failed' }

& $node (Join-Path $pluginRoot 'tests/routing-skill.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Routing skill trigger contract test failed' }

& $node (Join-Path $pluginRoot 'tests/routing-semantics.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Routing semantic contract test failed' }

& $node (Join-Path $pluginRoot 'tests/radar-routing-evidence.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Radar routing evidence test failed' }

& $node (Join-Path $pluginRoot 'tests/continue-capacity-subagent.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Capacity continuation hook test failed' }

& $node (Join-Path $pluginRoot 'tests/burst-mode.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Burst mode hook test failed' }

& $node (Join-Path $pluginRoot 'tests/portable-setup.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Portable setup test failed' }

& (Join-Path $pluginRoot 'tests/install.test.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Installer isolation test failed' }

& (Join-Path $pluginRoot 'tests/config-guard.test.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Config guard test failed' }

[pscustomobject]@{
  Plugin = 'codex-routing-matrix'
  JSON = 'PASS'
  NodeSyntax = 'PASS'
  PowerShellSyntax = 'PASS'
  RuntimeSmokeSessionTrust = 'STRICT'
  Profiles = 'PASS'
  Marketplace = $marketplaceStatus
  RoutingMatrix = 'PASS'
  SessionContract = 'PASS'
  RoutingSkill = 'PASS'
  RadarEvidence = 'PASS'
  CapacityContinuation = 'PASS'
  PortableSetup = 'PASS'
  Installer = 'PASS'
  ConfigGuard = 'PASS'
} | ConvertTo-Json -Compress
