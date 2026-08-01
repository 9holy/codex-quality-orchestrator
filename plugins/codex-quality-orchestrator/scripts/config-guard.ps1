[CmdletBinding()]
param(
  [ValidateSet('Install', 'Repair', 'Watch', 'Status', 'Uninstall')]
  [string]$Mode = 'Status',
  [string]$CodexHome = '',
  [string]$CodexCommand = 'codex',
  [string]$MarketplaceSource = '',
  [string]$MarketplaceRef = '',
  [string]$StartupDirectory = '',
  [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pluginId = 'codex-quality-orchestrator@codex-quality-orchestrator'
$hookIds = @(
  "$pluginId`:hooks/hooks.json:pre_tool_use:0:0",
  "$pluginId`:hooks/hooks.json:session_start:0:0",
  "$pluginId`:hooks/hooks.json:subagent_start:0:0",
  "$pluginId`:hooks/hooks.json:subagent_stop:0:0"
)

function Resolve-CodexHome {
  param([string]$Value)
  if (-not [string]::IsNullOrWhiteSpace($Value)) {
    return [IO.Path]::GetFullPath($Value)
  }
  if (-not [string]::IsNullOrWhiteSpace($env:CODEX_HOME)) {
    return [IO.Path]::GetFullPath($env:CODEX_HOME)
  }
  return Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex'
}

function Invoke-CodexJson {
  param([string[]]$Arguments)
  $global:LASTEXITCODE = 0
  $lines = @(& $CodexCommand @Arguments 2>&1)
  $exitCode = $LASTEXITCODE
  $text = ($lines | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
  if ($exitCode -ne 0) {
    throw "codex $($Arguments -join ' ') failed with exit code $exitCode`: $text"
  }
  $start = $text.IndexOf('{')
  $end = $text.LastIndexOf('}')
  if ($start -lt 0 -or $end -lt $start) {
    throw "codex did not return JSON: $text"
  }
  return $text.Substring($start, $end - $start + 1) | ConvertFrom-Json
}

function Get-ObjectValue {
  param([object]$Object, [string[]]$Names)
  if ($null -eq $Object) { return $null }
  foreach ($name in $Names) {
    if ($Object.PSObject.Properties.Name -contains $name) {
      $value = [string]$Object.$name
      if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
    }
  }
  return $null
}

function Get-HookBundleHash {
  param([string]$PluginRoot)
  $relativeFiles = @(
    'hooks\hooks.json',
    'hooks\inject-routing-policy.cjs',
    'hooks\enforce-agent-routing.cjs',
    'hooks\routing-ledger.cjs',
    'hooks\track-subagent-start.cjs',
    'hooks\continue-capacity-subagent.cjs',
    'routing-policy.json',
    'references\RULE16.md'
  )
  $records = foreach ($relative in $relativeFiles) {
    $path = Join-Path $PluginRoot $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Hook bundle file is missing: $path"
    }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    "$($relative.Replace('\', '/'))=$hash"
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($records -join "`n"))
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-InstalledPlugin {
  $result = Invoke-CodexJson @('plugin', 'list', '--json')
  return @($result.installed | Where-Object {
    $_.pluginId -ceq $pluginId -and [bool]$_.installed -and [bool]$_.enabled
  }) | Select-Object -First 1
}

function Read-TrustedHooks {
  param([string]$ConfigPath)
  if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    throw "Codex config does not exist: $ConfigPath"
  }
  $text = [IO.File]::ReadAllText($ConfigPath, [Text.UTF8Encoding]::new($false))
  $records = @()
  foreach ($hookId in $hookIds) {
    $escapedId = [regex]::Escape($hookId)
    $quotedId = '(?:"' + $escapedId + '"|' + "'" + $escapedId + "'" + ')'
    $pattern = '(?ms)^\[hooks\.state\.' + $quotedId +
      '\]\s*\r?\ntrusted_hash\s*=\s*"(sha256:[0-9a-f]{64})"\s*$'
    $match = [regex]::Match($text, $pattern)
    if (-not $match.Success) {
      throw "Hook trust is missing for $hookId. Approve the exact hook in /hooks before enabling the guard."
    }
    $records += [ordered]@{ id=$hookId; trustedHash=$match.Groups[1].Value }
  }
  return $records
}

function New-FileBackup {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
  $name = Split-Path -Leaf $Path
  $directory = Join-Path (Split-Path -Parent $Path) ($name + '-' + $stamp)
  New-Item -ItemType Directory -Path $directory -ErrorAction Stop | Out-Null
  $backupFile = Join-Path $directory $name
  Copy-Item -LiteralPath $Path -Destination $backupFile -ErrorAction Stop
  $hash = (Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText(
    (Join-Path $directory 'SHA256SUMS'),
    ($hash + ' *' + $name + [Environment]::NewLine),
    [Text.UTF8Encoding]::new($false)
  )
  return $directory
}

function Write-Utf8Atomic {
  param([string]$Path, [string]$Text)
  $temp = $Path + '.tmp-' + [guid]::NewGuid().ToString('N')
  try {
    [IO.File]::WriteAllText($temp, $Text, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $Path -Force -ErrorAction Stop
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
  }
}

function Add-TrustedHooks {
  param([string]$ConfigPath, [object[]]$TrustedHooks)
  $backups = @()
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $text = [IO.File]::ReadAllText($ConfigPath, [Text.UTF8Encoding]::new($false))
    $append = @()
    foreach ($record in $TrustedHooks) {
      $escapedId = [regex]::Escape([string]$record.id)
      $quotedId = '(?:"' + $escapedId + '"|' + "'" + $escapedId + "'" + ')'
      $sectionPattern = '(?m)^\[hooks\.state\.' + $quotedId + '\]\s*$'
      if ([regex]::IsMatch($text, $sectionPattern)) {
        $exactPattern = '(?ms)^\[hooks\.state\.' + $quotedId +
          '\]\s*\r?\ntrusted_hash\s*=\s*"' + [regex]::Escape([string]$record.trustedHash) + '"\s*$'
        if (-not [regex]::IsMatch($text, $exactPattern)) {
          throw "Hook trust changed for $($record.id). Refusing to overwrite it; review the hook again in /hooks."
        }
        continue
      }
      $append += "[hooks.state.`"$($record.id)`"]`ntrusted_hash = `"$($record.trustedHash)`""
    }
    if ($append.Count -eq 0) { return $backups }

    $backups += New-FileBackup $ConfigPath
    $payload = "`n`n" + ($append -join "`n`n") + "`n"
    [IO.File]::AppendAllText($ConfigPath, $payload, [Text.UTF8Encoding]::new($false))
    if (Test-TrustPresent $TrustedHooks) { return $backups }
    Start-Sleep -Milliseconds (250 * $attempt)
  }
  throw 'External config writes prevented Hook trust restoration after three append-only attempts'
}

function Read-GuardState {
  if (-not (Test-Path -LiteralPath $script:statePath -PathType Leaf)) {
    throw "Config guard state does not exist: $script:statePath"
  }
  $state = Get-Content -LiteralPath $script:statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([int]$state.schemaVersion -ne 1 -or [string]$state.pluginId -cne $pluginId) {
    throw 'Unsupported config guard state'
  }
  if ([string]::IsNullOrWhiteSpace([string]$state.marketplaceSource)) {
    throw 'Config guard state has no marketplace source'
  }
  if ([string]::IsNullOrWhiteSpace([string]$state.marketplaceSourceType) -or
      [string]::IsNullOrWhiteSpace([string]$state.pluginVersion) -or
      [string]::IsNullOrWhiteSpace([string]$state.installedPath) -or
      [string]::IsNullOrWhiteSpace([string]$state.codexCommand) -or
      [string]$state.hookBundleHash -notmatch '^[0-9a-f]{64}$') {
    throw 'Config guard state is missing the bound plugin identity'
  }
  $records = @($state.trustedHooks)
  if ($records.Count -ne $hookIds.Count) {
    throw 'Config guard state must contain exactly the approved plugin Hook records'
  }
  foreach ($hookId in $hookIds) {
    $matches = @($records | Where-Object { [string]$_.id -ceq $hookId })
    if ($matches.Count -ne 1 -or [string]$matches[0].trustedHash -notmatch '^sha256:[0-9a-f]{64}$') {
      throw "Invalid config guard Hook record: $hookId"
    }
  }
  return $state
}

function Test-InstalledIdentity {
  param([object]$Installed, [object]$State)
  if ([string]$Installed.version -cne [string]$State.pluginVersion) { return $false }
  $sourceType = Get-ObjectValue $Installed.marketplaceSource @('sourceType', 'type')
  $source = Get-ObjectValue $Installed.marketplaceSource @('source', 'repoUrl', 'url')
  if ([string]$sourceType -cne [string]$State.marketplaceSourceType) { return $false }
  if ([string]$sourceType -ceq 'local') {
    return [string]$source -ieq [string]$State.marketplaceSource
  }
  return [string]$source -ceq [string]$State.marketplaceSource
}

function Test-TrustPresent {
  param([object[]]$TrustedHooks)
  if (-not (Test-Path -LiteralPath $script:configPath -PathType Leaf)) { return $false }
  $text = [IO.File]::ReadAllText($script:configPath, [Text.UTF8Encoding]::new($false))
  foreach ($record in $TrustedHooks) {
    $escapedId = [regex]::Escape([string]$record.id)
    $quotedId = '(?:"' + $escapedId + '"|' + "'" + $escapedId + "'" + ')'
    $pattern = '(?ms)^\[hooks\.state\.' + $quotedId +
      '\]\s*\r?\ntrusted_hash\s*=\s*"' + [regex]::Escape([string]$record.trustedHash) + '"\s*$'
    if (-not [regex]::IsMatch($text, $pattern)) { return $false }
  }
  return $true
}

function Repair-Registration {
  $state = Read-GuardState
  $script:CodexCommand = [string]$state.codexCommand
  $installed = Get-InstalledPlugin
  $pluginWasMissing = $null -eq $installed
  $backups = @()
  $installedPath = [string]$state.installedPath
  if ($null -eq $installed) {
    $backups += New-FileBackup $script:configPath
    $arguments = @('plugin', 'marketplace', 'add', [string]$state.marketplaceSource, '--json')
    if (-not [string]::IsNullOrWhiteSpace([string]$state.marketplaceRef)) {
      $arguments += @('--ref', [string]$state.marketplaceRef)
    }
    $marketplace = Invoke-CodexJson $arguments
    $marketplaceName = [string]$marketplace.marketplaceName
    if ([string]::IsNullOrWhiteSpace($marketplaceName)) {
      throw 'Marketplace add did not return a marketplace name'
    }
    $selector = $pluginId.Split('@')[0] + '@' + $marketplaceName
    $added = Invoke-CodexJson @('plugin', 'add', $selector, '--json')
    $installedPath = [string]$added.installedPath
    $installed = Get-InstalledPlugin
  }

  if ($null -eq $installed -or -not (Test-InstalledIdentity $installed $state)) {
    throw 'Installed plugin source or version does not match the approved config guard state'
  }
  if ([string]::IsNullOrWhiteSpace($installedPath) -or
      (Get-HookBundleHash $installedPath) -cne [string]$state.hookBundleHash) {
    throw 'Installed Hook bundle differs from the content approved when the config guard was enabled'
  }

  $backups += @(Add-TrustedHooks $script:configPath @($state.trustedHooks))
  $verified = Get-InstalledPlugin
  if ($null -eq $verified -or -not (Test-InstalledIdentity $verified $state) -or
      -not (Test-TrustPresent @($state.trustedHooks))) {
    throw 'Config guard repair did not restore an enabled plugin and exact Hook trust'
  }
  return [pscustomobject]@{
    Healthy = $true
    Repaired = $pluginWasMissing -or $backups.Count -gt 0
    Backups = $backups
    Version = [string]$verified.version
  }
}

function Invoke-RepairLocked {
  New-Item -ItemType Directory -Path $guardDir -Force | Out-Null
  $lock = [IO.File]::Open(
    $lockPath,
    [IO.FileMode]::OpenOrCreate,
    [IO.FileAccess]::ReadWrite,
    [IO.FileShare]::None
  )
  try {
    $lock.SetLength(0)
    $bytes = [Text.Encoding]::UTF8.GetBytes("PID=$PID`nStarted=$(Get-Date -Format o)`n")
    $lock.Write($bytes, 0, $bytes.Length)
    $lock.Flush()
    return Repair-Registration
  } finally {
    $lock.Dispose()
    if (Test-Path -LiteralPath $lockPath) { Remove-Item -LiteralPath $lockPath -Force }
  }
}

function Get-ConfigFingerprint {
  if (-not (Test-Path -LiteralPath $script:configPath -PathType Leaf)) { return 'missing' }
  $item = Get-Item -LiteralPath $script:configPath
  return "$($item.LastWriteTimeUtc.Ticks):$($item.Length)"
}

function Write-GuardLog {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message$([Environment]::NewLine)"
  [IO.File]::AppendAllText($script:logPath, $line, [Text.UTF8Encoding]::new($false))
}

function Get-ValidatedWatchProcess {
  if (-not (Test-Path -LiteralPath $pidPath -PathType Leaf)) { return $null }
  try {
    $record = Get-Content -LiteralPath $pidPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $process = Get-Process -Id ([int]$record.pid) -ErrorAction Stop
    $startTicks = $process.StartTime.ToUniversalTime().Ticks
    if ($startTicks -ne [long]$record.startTimeUtcTicks) { return $null }
    return $process
  } catch {
    return $null
  }
}

$CodexHome = Resolve-CodexHome $CodexHome
New-Item -ItemType Directory -Path $CodexHome -Force | Out-Null
$guardDir = Join-Path $CodexHome '.codex-quality-orchestrator-guard'
$script:configPath = Join-Path $CodexHome 'config.toml'
$script:statePath = Join-Path $guardDir 'state.json'
$script:logPath = Join-Path $guardDir 'guard.log'
$guardScript = Join-Path $guardDir 'config-guard.ps1'
$pidPath = Join-Path $guardDir 'watch.pid'
$lockPath = Join-Path $guardDir 'repair.lock'

if ([string]::IsNullOrWhiteSpace($StartupDirectory)) {
  $StartupDirectory = [Environment]::GetFolderPath('Startup')
}
$launcherPath = if ([string]::IsNullOrWhiteSpace($StartupDirectory)) {
  $null
} else {
  Join-Path ([IO.Path]::GetFullPath($StartupDirectory)) 'CodexQualityOrchestratorGuard.cmd'
}

switch ($Mode) {
  'Install' {
    if ($env:OS -cne 'Windows_NT') {
      throw 'Automatic startup installation is currently supported on Windows only; Repair mode is portable.'
    }
    $CodexCommand = (Get-Command $CodexCommand -ErrorAction Stop).Source
    $installed = Get-InstalledPlugin
    if ($null -eq $installed) { throw 'Install and enable the plugin before enabling the config guard.' }
    $trustedHooks = @(Read-TrustedHooks $script:configPath)
    $source = if (-not [string]::IsNullOrWhiteSpace($MarketplaceSource)) {
      $MarketplaceSource
    } else {
      Get-ObjectValue $installed.marketplaceSource @('source', 'repoUrl', 'url')
    }
    if ([string]::IsNullOrWhiteSpace($source)) {
      throw 'Could not determine the marketplace source; pass -MarketplaceSource explicitly.'
    }
    $sourceType = Get-ObjectValue $installed.marketplaceSource @('sourceType', 'type')
    if ([string]::IsNullOrWhiteSpace($sourceType)) {
      throw 'Could not determine the marketplace source type.'
    }
    $ref = if (-not [string]::IsNullOrWhiteSpace($MarketplaceRef)) {
      $MarketplaceRef
    } else {
      Get-ObjectValue $installed.marketplaceSource @('ref', 'gitRef')
    }
    $version = [string]$installed.version
    $marketplaceName = [string]$installed.marketplaceName
    $cachedRoot = Join-Path $CodexHome ("plugins\cache\$marketplaceName\codex-quality-orchestrator\$version")
    $approvedRoot = if (Test-Path -LiteralPath $cachedRoot -PathType Container) {
      $cachedRoot
    } else {
      Split-Path -Parent $PSScriptRoot
    }
    $bundleHash = Get-HookBundleHash $approvedRoot

    $existingWatch = Get-ValidatedWatchProcess
    if ($null -ne $existingWatch -and $existingWatch.Id -ne $PID) {
      $existingWatch | Stop-Process -Force
      if (-not $existingWatch.WaitForExit(5000)) {
        throw "Existing config guard process did not stop: $($existingWatch.Id)"
      }
    }

    New-Item -ItemType Directory -Path $guardDir -Force | Out-Null
    if ([IO.Path]::GetFullPath($PSCommandPath) -cne [IO.Path]::GetFullPath($guardScript)) {
      [void](New-FileBackup $guardScript)
      Copy-Item -LiteralPath $PSCommandPath -Destination $guardScript -Force
    }
    [void](New-FileBackup $script:statePath)
    $state = [ordered]@{
      schemaVersion = 1
      pluginId = $pluginId
      marketplaceSource = $source
      marketplaceSourceType = $sourceType
      marketplaceRef = $ref
      pluginVersion = $version
      installedPath = [IO.Path]::GetFullPath($approvedRoot)
      codexCommand = $CodexCommand
      hookBundleHash = $bundleHash
      trustedHooks = $trustedHooks
    } | ConvertTo-Json -Depth 6
    Write-Utf8Atomic $script:statePath ($state + [Environment]::NewLine)

    if ($null -eq $launcherPath) { throw 'Windows Startup directory is unavailable.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $launcherPath) -Force | Out-Null
    [void](New-FileBackup $launcherPath)
    $launcher = "@echo off`r`nstart `"`" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$guardScript`" -Mode Watch -CodexHome `"$CodexHome`" -CodexCommand `"$CodexCommand`"`r`n"
    Write-Utf8Atomic $launcherPath $launcher
    if (-not $NoStart) {
      $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$guardScript`" -Mode Watch -CodexHome `"$CodexHome`" -CodexCommand `"$CodexCommand`""
      Start-Process powershell.exe -ArgumentList $arguments -WindowStyle Hidden
      Start-Sleep -Milliseconds 500
    }
    [pscustomobject]@{ Installed=$true; Source=$source; Ref=$ref; Launcher=$launcherPath; Started=(-not $NoStart) } | ConvertTo-Json -Compress
  }
  'Repair' {
    (Invoke-RepairLocked) | ConvertTo-Json -Compress
  }
  'Watch' {
    New-Item -ItemType Directory -Path $guardDir -Force | Out-Null
    if ($null -ne (Get-ValidatedWatchProcess)) { exit 0 }
    if (Test-Path -LiteralPath $pidPath -PathType Leaf) {
      Remove-Item -LiteralPath $pidPath -Force
    }
    $self = Get-Process -Id $PID -ErrorAction Stop
    $pidRecord = [ordered]@{
      pid = $PID
      startTimeUtcTicks = $self.StartTime.ToUniversalTime().Ticks
    } | ConvertTo-Json
    [IO.File]::WriteAllText($pidPath, $pidRecord + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    try {
      $failures = 0
      try {
        Write-GuardLog ((Invoke-RepairLocked | ConvertTo-Json -Compress))
      } catch {
        $failures = 1
        Write-GuardLog "ERROR $($_.Exception.Message)"
      }
      $fingerprint = Get-ConfigFingerprint
      $lastAttempt = [DateTime]::UtcNow
      while ($true) {
        Start-Sleep -Seconds 1
        $next = Get-ConfigFingerprint
        $changed = $next -cne $fingerprint
        $retryDelay = [Math]::Min(300, 15 * [Math]::Pow(2, [Math]::Max(0, $failures - 1)))
        $retryDue = $failures -gt 0 -and ([DateTime]::UtcNow - $lastAttempt).TotalSeconds -ge $retryDelay
        if (-not $changed -and -not $retryDue) { continue }
        if ($changed) {
          $failures = 0
          Start-Sleep -Milliseconds 750
        }
        try {
          Write-GuardLog ((Invoke-RepairLocked | ConvertTo-Json -Compress))
          $failures = 0
        } catch {
          $failures++
          Write-GuardLog "ERROR $($_.Exception.Message)"
        }
        $lastAttempt = [DateTime]::UtcNow
        $fingerprint = Get-ConfigFingerprint
      }
    } finally {
      if (Test-Path -LiteralPath $pidPath) { Remove-Item -LiteralPath $pidPath -Force }
    }
  }
  'Status' {
    $stateExists = Test-Path -LiteralPath $script:statePath -PathType Leaf
    $watching = $null -ne (Get-ValidatedWatchProcess)
    $healthy = $false
    if ($stateExists) {
      try {
        $state = Read-GuardState
        $script:CodexCommand = [string]$state.codexCommand
        $installed = Get-InstalledPlugin
        $healthy = $null -ne $installed -and
          (Test-InstalledIdentity $installed $state) -and
          (Get-HookBundleHash ([string]$state.installedPath)) -ceq [string]$state.hookBundleHash -and
          (Test-TrustPresent @($state.trustedHooks))
      } catch { $healthy = $false }
    }
    [pscustomobject]@{ Installed=$stateExists; Watching=$watching; Healthy=$healthy; State=$script:statePath } | ConvertTo-Json -Compress
  }
  'Uninstall' {
    $watchProcess = Get-ValidatedWatchProcess
    if ($null -ne $watchProcess -and $watchProcess.Id -ne $PID) {
      $watchProcess | Stop-Process -Force
    }
    foreach ($path in @($launcherPath, $pidPath, $script:statePath, $guardScript)) {
      if ($null -ne $path -and (Test-Path -LiteralPath $path -PathType Leaf)) {
        [void](New-FileBackup $path)
        Remove-Item -LiteralPath $path -Force
      }
    }
    [pscustomobject]@{ Uninstalled=$true; LogPreserved=$script:logPath } | ConvertTo-Json -Compress
  }
}
