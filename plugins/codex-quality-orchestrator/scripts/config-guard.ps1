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
$burstMaxConcurrentThreads = 25
$hookIds = @(
  "$pluginId`:hooks/hooks.json:pre_tool_use:0:0",
  "$pluginId`:hooks/hooks.json:session_start:0:0",
  "$pluginId`:hooks/hooks.json:user_prompt_submit:0:0",
  "$pluginId`:hooks/hooks.json:subagent_stop:0:0"
)
$retiredHookIds = @(
  "$pluginId`:hooks/hooks.json:subagent_start:0:0"
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

function Get-MarketplaceInstallMetadata {
  param([string]$MarketplaceName)
  if ([string]::IsNullOrWhiteSpace($MarketplaceName)) { return $null }
  $path = Join-Path $CodexHome (".tmp\marketplaces\$MarketplaceName\.codex-marketplace-install.json")
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  try {
    return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    throw "Marketplace install metadata is invalid: $path"
  }
}

function Get-HookBundleHash {
  param([string]$PluginRoot)
  $relativeFiles = @(
    'hooks\hooks.json',
    'hooks\inject-routing-policy.cjs',
    'hooks\enforce-agent-routing.cjs',
    'hooks\burst-mode.cjs',
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

function New-DirectoryBackup {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return $null }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
  $backup = $Path + '-' + $stamp
  Copy-Item -LiteralPath $Path -Destination $backup -Recurse -ErrorAction Stop
  if (-not (Test-Path -LiteralPath $backup -PathType Container)) {
    throw "Directory backup failed: $Path"
  }
  return $backup
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

function Set-TomlSectionValue {
  param(
    [string]$Text,
    [string]$HeaderPattern,
    [string]$CanonicalHeader,
    [string]$Key,
    [string]$Value
  )
  $newLine = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $headers = [regex]::Matches($Text, $HeaderPattern)
  if ($headers.Count -gt 1) { throw "Duplicate TOML section: $CanonicalHeader" }
  if ($headers.Count -eq 0) {
    $prefix = $Text.TrimEnd("`r", "`n")
    if (-not [string]::IsNullOrEmpty($prefix)) { $prefix += $newLine + $newLine }
    return $prefix + $CanonicalHeader + $newLine + "$Key = $Value" + $newLine
  }

  $header = $headers[0]
  $sectionHeaderRegex = [regex]'(?m)^\[[^\r\n]+\]\s*$'
  $nextHeader = $sectionHeaderRegex.Match($Text, $header.Index + $header.Length)
  $sectionEnd = if ($nextHeader.Success) { $nextHeader.Index } else { $Text.Length }
  $section = $Text.Substring($header.Index, $sectionEnd - $header.Index)
  $keyPattern = '(?m)^' + [regex]::Escape($Key) + '\s*=.*$'
  $keys = [regex]::Matches($section, $keyPattern)
  if ($keys.Count -gt 1) { throw "Duplicate TOML key $Key in $CanonicalHeader" }
  if ($keys.Count -eq 1) {
    $keyMatch = $keys[0]
    $updated = $section.Remove($keyMatch.Index, $keyMatch.Length).Insert($keyMatch.Index, "$Key = $Value")
  } else {
    $updated = $section.Insert($header.Length, $newLine + "$Key = $Value")
  }
  return $Text.Substring(0, $header.Index) + $updated + $Text.Substring($sectionEnd)
}

function Remove-TomlSection {
  param([string]$Text, [string]$HeaderPattern)
  $headers = [regex]::Matches($Text, $HeaderPattern)
  if ($headers.Count -gt 1) { throw "Duplicate TOML section matching $HeaderPattern" }
  if ($headers.Count -eq 0) { return $Text }

  $header = $headers[0]
  $nextHeader = ([regex]'(?m)^\[[^\r\n]+\]\s*$').Match($Text, $header.Index + $header.Length)
  $sectionEnd = if ($nextHeader.Success) { $nextHeader.Index } else { $Text.Length }
  return $Text.Remove($header.Index, $sectionEnd - $header.Index)
}

function Test-PluginRegistration {
  if (-not (Test-Path -LiteralPath $script:configPath -PathType Leaf)) { return $false }
  $text = [IO.File]::ReadAllText($script:configPath, [Text.UTF8Encoding]::new($false))
  $escapedId = [regex]::Escape($pluginId)
  $quotedId = '(?:"' + $escapedId + '"|' + "'" + $escapedId + "'" + ')'
  $pattern = '(?ms)^\[plugins\.' + $quotedId + '\]\s*\r?\n(?:(?!^\[).)*?^enabled\s*=\s*true\s*$'
  return [regex]::IsMatch($text, $pattern)
}

function Test-BurstCapacity {
  if (-not (Test-Path -LiteralPath $script:configPath -PathType Leaf)) { return $false }
  $text = [IO.File]::ReadAllText($script:configPath, [Text.UTF8Encoding]::new($false))
  $match = [regex]::Match(
    $text,
    '(?ms)^\[agents\]\s*\r?\n(?:(?!^\[).)*?^max_concurrent_threads_per_session\s*=\s*(\d+)\s*$'
  )
  return $match.Success -and [int]$match.Groups[1].Value -eq $burstMaxConcurrentThreads
}

function Merge-ManagedConfig {
  param([string]$ConfigPath, [object[]]$TrustedHooks)
  $backups = @()
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $original = [IO.File]::ReadAllText($ConfigPath, [Text.UTF8Encoding]::new($false))
    $text = $original
    $escapedPluginId = [regex]::Escape($pluginId)
    $quotedPluginId = '(?:"' + $escapedPluginId + '"|' + "'" + $escapedPluginId + "'" + ')'
    $text = Set-TomlSectionValue -Text $text `
      -HeaderPattern ('(?m)^\[plugins\.' + $quotedPluginId + '\]\s*$') `
      -CanonicalHeader "[plugins.`"$pluginId`"]" -Key 'enabled' -Value 'true'
    $text = Set-TomlSectionValue -Text $text `
      -HeaderPattern '(?m)^\[agents\]\s*$' `
      -CanonicalHeader '[agents]' -Key 'max_concurrent_threads_per_session' `
      -Value ([string]$burstMaxConcurrentThreads)
    foreach ($retiredHookId in $retiredHookIds) {
      $escapedId = [regex]::Escape($retiredHookId)
      $quotedId = '(?:"' + $escapedId + '"|' + "'" + $escapedId + "'" + ')'
      $text = Remove-TomlSection -Text $text `
        -HeaderPattern ('(?m)^\[hooks\.state\.' + $quotedId + '\]\s*$')
    }
    foreach ($record in $TrustedHooks) {
      $escapedId = [regex]::Escape([string]$record.id)
      $quotedId = '(?:"' + $escapedId + '"|' + "'" + $escapedId + "'" + ')'
      $text = Set-TomlSectionValue -Text $text `
        -HeaderPattern ('(?m)^\[hooks\.state\.' + $quotedId + '\]\s*$') `
        -CanonicalHeader "[hooks.state.`"$($record.id)`"]" -Key 'trusted_hash' `
        -Value ('"' + [string]$record.trustedHash + '"')
    }
    if ($text -ceq $original) { return $backups }

    $latest = [IO.File]::ReadAllText($ConfigPath, [Text.UTF8Encoding]::new($false))
    if ($latest -cne $original) {
      Start-Sleep -Milliseconds (250 * $attempt)
      continue
    }
    $backup = New-FileBackup $ConfigPath
    if ($null -ne $backup) { $backups += $backup }
    $latest = [IO.File]::ReadAllText($ConfigPath, [Text.UTF8Encoding]::new($false))
    if ($latest -cne $original) {
      Start-Sleep -Milliseconds (250 * $attempt)
      continue
    }
    Write-Utf8Atomic $ConfigPath $text
    if ((Test-PluginRegistration) -and (Test-BurstCapacity) -and (Test-TrustPresent $TrustedHooks)) { return $backups }
    Start-Sleep -Milliseconds (250 * $attempt)
  }
  throw 'External config writes prevented managed plugin configuration restoration after three attempts'
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

function Add-MarketplaceWithRecovery {
  param([object]$State, [string]$MarketplaceRef)
  $marketplaceName = $pluginId.Split('@')[1]
  $arguments = @('plugin', 'marketplace', 'add', [string]$State.marketplaceSource, '--json')
  if (-not [string]::IsNullOrWhiteSpace($MarketplaceRef)) {
    $arguments += @('--ref', $MarketplaceRef)
  }
  try {
    return [pscustomobject]@{ Result=(Invoke-CodexJson $arguments); Backup=$null }
  } catch {
    if ($_.Exception.Message -notmatch "marketplace '.*' is already added from a different source") { throw }
  }

  $marketplaceRoot = Join-Path $CodexHome (".tmp\marketplaces\$marketplaceName")
  $metadata = Get-MarketplaceInstallMetadata $marketplaceName
  $metadataMatches = $null -ne $metadata -and
    [string]$metadata.source_type -ceq [string]$State.marketplaceSourceType -and
    [string]$metadata.source -ceq [string]$State.marketplaceSource -and
    ([string]::IsNullOrWhiteSpace($MarketplaceRef) -or [string]$metadata.ref_name -ceq $MarketplaceRef)
  if (-not $metadataMatches) {
    throw 'Conflicting marketplace metadata does not match the approved source and ref; refusing automatic removal'
  }

  $backup = New-DirectoryBackup $marketplaceRoot
  try {
    [void](Invoke-CodexJson @('plugin', 'marketplace', 'remove', $marketplaceName, '--json'))
    $result = Invoke-CodexJson $arguments
    return [pscustomobject]@{ Result=$result; Backup=$backup }
  } catch {
    if ($null -ne $backup -and
        -not (Test-Path -LiteralPath $marketplaceRoot -PathType Container)) {
      Copy-Item -LiteralPath $backup -Destination $marketplaceRoot -Recurse -ErrorAction SilentlyContinue
    }
    throw
  }
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
  if ([string]::IsNullOrWhiteSpace($installedPath) -or
      (Get-HookBundleHash $installedPath) -cne [string]$state.hookBundleHash) {
    throw 'Installed Hook bundle differs from the content approved when the config guard was enabled'
  }

  $backups += @(Merge-ManagedConfig $script:configPath @($state.trustedHooks))
  $installed = Get-InstalledPlugin
  if ($null -eq $installed) {
    $backups += New-FileBackup $script:configPath
    $marketplaceRef = [string]$state.marketplaceRef
    if ([string]::IsNullOrWhiteSpace($marketplaceRef)) {
      $metadata = Get-MarketplaceInstallMetadata ($pluginId.Split('@')[1])
      if ($null -ne $metadata -and
          [string]$metadata.source_type -ceq [string]$state.marketplaceSourceType -and
          [string]$metadata.source -ceq [string]$state.marketplaceSource) {
        $marketplaceRef = [string]$metadata.ref_name
      }
    }
    $marketplaceRepair = Add-MarketplaceWithRecovery $state $marketplaceRef
    if ($null -ne $marketplaceRepair.Backup) { $backups += [string]$marketplaceRepair.Backup }
    $marketplace = $marketplaceRepair.Result
    $marketplaceName = [string]$marketplace.marketplaceName
    if ([string]::IsNullOrWhiteSpace($marketplaceName)) {
      throw 'Marketplace add did not return a marketplace name'
    }
    $installed = Get-InstalledPlugin
    if ($null -eq $installed) {
      $selector = $pluginId.Split('@')[0] + '@' + $marketplaceName
      $added = Invoke-CodexJson @('plugin', 'add', $selector, '--json')
      $installedPath = [string]$added.installedPath
      $installed = Get-InstalledPlugin
    }
  }

  if ($null -eq $installed -or -not (Test-InstalledIdentity $installed $state)) {
    throw 'Installed plugin source or version does not match the approved config guard state'
  }
  $verified = Get-InstalledPlugin
  if ($null -eq $verified -or -not (Test-InstalledIdentity $verified $state) -or
      -not (Test-BurstCapacity) -or
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
    $version = [string]$installed.version
    $marketplaceName = [string]$installed.marketplaceName
    $metadata = Get-MarketplaceInstallMetadata $marketplaceName
    $ref = if (-not [string]::IsNullOrWhiteSpace($MarketplaceRef)) {
      $MarketplaceRef
    } else {
      $installedRef = Get-ObjectValue $installed.marketplaceSource @('ref', 'gitRef')
      if (-not [string]::IsNullOrWhiteSpace($installedRef)) {
        $installedRef
      } elseif ($null -ne $metadata) {
        [string]$metadata.ref_name
      } else {
        $null
      }
    }
    $cachedRoot = Join-Path $CodexHome ("plugins\cache\$marketplaceName\codex-quality-orchestrator\$version")
    $installSource = if ($installed.PSObject.Properties.Name -contains 'source') { $installed.source } else { $null }
    $installType = Get-ObjectValue $installSource @('source', 'sourceType', 'type')
    $localRoot = Get-ObjectValue $installSource @('path', 'localPath')
    $approvedRoot = if ($installType -eq 'local' -and -not [string]::IsNullOrWhiteSpace($localRoot) -and
        (Test-Path -LiteralPath $localRoot -PathType Container)) {
      [IO.Path]::GetFullPath($localRoot)
    } elseif (Test-Path -LiteralPath $cachedRoot -PathType Container) {
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
          (Test-BurstCapacity) -and
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
