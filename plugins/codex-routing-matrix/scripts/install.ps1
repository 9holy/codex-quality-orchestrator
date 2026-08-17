[CmdletBinding()]
param(
  [string]$CodexHome = '',
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-TomlString {
  param([string]$Text, [string]$Key)
  $pattern = '(?m)^' + [regex]::Escape($Key) + '\s*=\s*["'']([^"'']*)["'']\s*$'
  $match = [regex]::Match($Text, $pattern)
  if ($match.Success) { return $match.Groups[1].Value }
  return $null
}

function Test-ProfileContract {
  param([string]$Path, [object]$Config, [string]$AgentType)
  $text = [IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
  if ((Get-TomlString $text 'name') -cne $AgentType) {
    return "name is not $AgentType"
  }
  if ((Get-TomlString $text 'model') -cne $Config.model) {
    return "model is not $($Config.model)"
  }

  $effort = Get-TomlString $text 'model_reasoning_effort'
  if ($Config.effortMode -eq 'required' -and $null -ne $effort) {
    return 'reasoning effort must be selected at spawn time, not pinned in TOML'
  }
  if ($Config.effortMode -eq 'fixed' -and $effort -cne $Config.fixedEffort) {
    return "fixed effort is not $($Config.fixedEffort)"
  }
  if ($Config.PSObject.Properties.Name -contains 'sandboxMode') {
    if ((Get-TomlString $text 'sandbox_mode') -cne $Config.sandboxMode) {
      return "sandbox_mode is not $($Config.sandboxMode)"
    }
  }
  return $null
}

function Read-InstallState {
  param([string]$Path)
  $profiles = @{}
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $profiles }

  $state = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([int]$state.schemaVersion -ne 1) { throw "Unsupported install state schema: $($state.schemaVersion)" }
  foreach ($property in $state.profiles.PSObject.Properties) {
    $ownership = [string]$property.Value.ownership
    if ($ownership -notin @('created', 'replaced')) {
      throw "Invalid ownership in install state: $($property.Name)"
    }
    $backupFile = $null
    if ($property.Value.PSObject.Properties.Name -contains 'backupFile') {
      $backupFile = [string]$property.Value.backupFile
    }
    $profiles[$property.Name] = [ordered]@{
      ownership = $ownership
      backupFile = $backupFile
    }
  }
  return $profiles
}

function Write-InstallState {
  param([string]$Path, [hashtable]$Profiles)
  $orderedProfiles = [ordered]@{}
  foreach ($name in @($Profiles.Keys | Sort-Object)) {
    $orderedProfiles[$name] = $Profiles[$name]
  }
  $payload = [ordered]@{
    schemaVersion = 1
    profiles = $orderedProfiles
  } | ConvertTo-Json -Depth 5
  $temp = $Path + '.tmp-' + [guid]::NewGuid().ToString('N')
  try {
    [IO.File]::WriteAllText($temp, $payload + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $Path -Force -ErrorAction Stop
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
  }
}

function Resolve-StateBackupPath {
  param([string]$CodexHome, [string]$AgentsDir, [string]$RelativePath, [string]$FileName)
  if ([string]::IsNullOrWhiteSpace($RelativePath) -or [IO.Path]::IsPathRooted($RelativePath)) {
    throw "Invalid restore path for $FileName"
  }
  $portableRelative = $RelativePath.Replace('\', '/')
  $resolved = [IO.Path]::GetFullPath((Join-Path $CodexHome $portableRelative))
  $agentsPrefix = [IO.Path]::GetFullPath($AgentsDir).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($agentsPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Restore path escapes the agents directory: $RelativePath"
  }
  if ((Split-Path -Leaf $resolved) -cnotin @($FileName, ($FileName + '.bak'))) {
    throw "Restore file name does not match $FileName"
  }
  return $resolved
}

function New-ProfileBackup {
  param([string]$Target, [string]$AgentsDir)
  $fileName = Split-Path -Leaf $Target
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
  $backup = Join-Path $AgentsDir ($fileName + '-' + $stamp)
  New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
  $backupFile = Join-Path $backup ($fileName + '.bak')
  Copy-Item -LiteralPath $Target -Destination $backupFile -ErrorAction Stop
  $hash = (Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText(
    (Join-Path $backup 'SHA256SUMS'),
    ($hash + ' *' + (Split-Path -Leaf $backupFile) + [Environment]::NewLine),
    [Text.UTF8Encoding]::new($false)
  )
  return $backup
}

function New-FileBackup {
  param([string]$Target)
  $fileName = Split-Path -Leaf $Target
  $directory = Split-Path -Parent $Target
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
  $backup = Join-Path $directory ($fileName + '-' + $stamp)
  New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
  Copy-Item -LiteralPath $Target -Destination (Join-Path $backup $fileName) -ErrorAction Stop
  return $backup
}

function Install-DefaultAgentRules {
  param([string]$CodexHome, [bool]$FirstInstall)
  if (-not $FirstInstall) {
    return [pscustomobject]@{ Status='skipped'; Backup=$null }
  }

  $target = Join-Path $CodexHome 'AGENTS.md'
  $defaults = @'
## Meta Rule - Conflict Resolution

Data safety, correctness, and recoverability are veto constraints. For routine matters, explicit user instructions take precedence over efficiency and simplicity.
When rules conflict, prioritize correctness, safety, and recoverability, then choose the most direct implementation. If the user insists on a high-risk approach, record the risk and ask for confirmation. Refuse irreversible data destruction by default unless the user explicitly accepts the consequences.

## Implementation

Fix the root cause with the smallest clear and debuggable change.
Avoid unrelated refactoring, excessive defensive checks, redundant fallback logic, and compatibility paths for unsupported or hypothetical scenarios.
Stay focused on the current task. Pursue improvements only when they materially advance the requested outcome.
Do not pursue excessive consistency or over-testing. Do not add unnecessary gates, SHA-256 hashes, checksums, verification layers, or redundant tests unless they are required for correctness or by the task.
Follow the existing code style.
Minimal local refactoring is allowed when the existing structure directly prevents a correct fix. Security, permission, and necessary input validation are not excessive defensive measures.
'@.Trim()

  $backup = $null
  if (Test-Path -LiteralPath $target -PathType Leaf) {
    $text = [IO.File]::ReadAllText($target, [Text.UTF8Encoding]::new($false))
    if ($text -match '(?m)^## Meta Rule - Conflict Resolution\s*$' -and $text -match '(?m)^## Implementation\s*$') {
      return [pscustomobject]@{ Status='kept'; Backup=$null }
    }
    $backup = New-FileBackup $target
    $updated = $defaults + [Environment]::NewLine + [Environment]::NewLine + $text.TrimStart()
    $status = 'prepended'
  } else {
    $updated = $defaults
    $status = 'created'
  }

  $temp = $target + '.tmp-' + [guid]::NewGuid().ToString('N')
  try {
    [IO.File]::WriteAllText($temp, $updated.TrimEnd() + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $target -Force -ErrorAction Stop
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
  }
  return [pscustomobject]@{ Status=$status; Backup=$backup }
}

function Sync-CanonicalRoutingMatrix {
  param([string]$CodexHome, [string]$PluginRoot)
  $source = Join-Path $PluginRoot 'references/ROUTING_MATRIX.md'
  $target = Join-Path $CodexHome 'AGENTS.md'
  $canonical = [IO.File]::ReadAllText($source, [Text.UTF8Encoding]::new($false)).Trim()
  $backup = $null
  $updated = $null

  function Normalize-Rule([string]$Value) {
    return ([regex]::Replace($Value, '(?m)^##[^\r\n]*', '## RULE')).Replace("`r`n", "`n").Trim()
  }

  if (Test-Path -LiteralPath $target -PathType Leaf) {
    $text = [IO.File]::ReadAllText($target, [Text.UTF8Encoding]::new($false))
    $matches = [regex]::Matches($text, '(?ms)^## [^\r\n]+.*?(?=^## [^\r\n]+|\z)')
    $canonicalHeading = [regex]::Match($canonical, '^##[^\r\n]*').Value
    $named = @($matches | Where-Object { [regex]::Match($_.Value, '^##[^\r\n]*').Value -ceq $canonicalHeading })
    if ($named.Count -gt 0) {
      if ($named.Count -eq 1 -and $named[0].Value.Trim() -ceq $canonical) {
        return [pscustomobject]@{ Status='kept'; Backup=$null }
      }
      $backup = New-FileBackup $target
      $updated = $text
      foreach ($match in (@($named | Select-Object -Skip 1) | Sort-Object Index -Descending)) {
        $updated = $updated.Remove($match.Index, $match.Length)
      }
      $updated = $updated.Remove($named[0].Index, $named[0].Length).Insert($named[0].Index, $canonical)
      $status = if ($named.Count -gt 1) { 'deduplicated' } else { 'refreshed' }
    }
    $owned = @($matches | Where-Object { (Normalize-Rule $_.Value) -ceq (Normalize-Rule $canonical) })
    if ($null -eq $updated -and $owned.Count -gt 0) {
      if ($owned.Count -eq 1) {
        $installedHeading = [regex]::Match($owned[0].Value, '^##[^\r\n]*').Value
        if ($installedHeading -ceq $canonicalHeading) {
          return [pscustomobject]@{ Status='kept'; Backup=$null }
        }
        $backup = New-FileBackup $target
        $section = [regex]::new('^##[^\r\n]*').Replace($owned[0].Value, $canonicalHeading, 1)
        $updated = $text.Substring(0, $owned[0].Index) + $section + $text.Substring($owned[0].Index + $owned[0].Length)
        $status = 'migrated-heading'
      }
      if ($owned.Count -gt 1) {
        $backup = New-FileBackup $target
        $updated = $text
        foreach ($match in (@($owned | Select-Object -Skip 1) | Sort-Object Index -Descending)) {
          $updated = $updated.Remove($match.Index, $match.Length)
        }
        $section = [regex]::new('^##[^\r\n]*').Replace($owned[0].Value, $canonicalHeading, 1)
        $updated = $updated.Remove($owned[0].Index, $owned[0].Length).Insert($owned[0].Index, $section)
        $status = 'deduplicated'
      }
    }
    foreach ($match in $matches) {
      if ($null -ne $updated) { break }
      if ((Normalize-Rule $match.Value) -ceq (Normalize-Rule $canonical)) {
        return [pscustomobject]@{ Status='kept'; Backup=$null }
      }
    }

    if ($null -eq $updated) {
      $backup = New-FileBackup $target
      $updated = $text.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine + $canonical
      $status = 'appended'
    }
  } else {
    $updated = $canonical
    $status = 'created'
  }

  $temp = $target + '.tmp-' + [guid]::NewGuid().ToString('N')
  try {
    [IO.File]::WriteAllText($temp, $updated.TrimEnd() + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $target -Force -ErrorAction Stop
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
  }
  return [pscustomobject]@{ Status=$status; Backup=$backup }
}

function Convert-StateBackupsToNonLoadable {
  param([string]$CodexHome, [string]$AgentsDir, [string]$StatePath, [hashtable]$Profiles)
  $changed = $false
  foreach ($fileName in @($Profiles.Keys)) {
    $entry = $Profiles[$fileName]
    if ($entry.ownership -ne 'replaced' -or [string]::IsNullOrWhiteSpace($entry.backupFile)) {
      continue
    }
    $current = Resolve-StateBackupPath $CodexHome $AgentsDir $entry.backupFile $fileName
    if ((Split-Path -Leaf $current) -ceq ($fileName + '.bak')) { continue }
    if (-not (Test-Path -LiteralPath $current -PathType Leaf)) {
      throw "Original profile backup is missing: $current"
    }

    $nonLoadable = $current + '.bak'
    if (Test-Path -LiteralPath $nonLoadable) {
      if ((Get-FileHash -LiteralPath $current -Algorithm SHA256).Hash -cne
          (Get-FileHash -LiteralPath $nonLoadable -Algorithm SHA256).Hash) {
        throw "Non-loadable backup conflicts with legacy backup: $nonLoadable"
      }
      Remove-Item -LiteralPath $current -Force -ErrorAction Stop
    } else {
      Move-Item -LiteralPath $current -Destination $nonLoadable -ErrorAction Stop
    }
    $hash = (Get-FileHash -LiteralPath $nonLoadable -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText(
      (Join-Path (Split-Path -Parent $nonLoadable) 'SHA256SUMS'),
      ($hash + ' *' + (Split-Path -Leaf $nonLoadable) + [Environment]::NewLine),
      [Text.UTF8Encoding]::new($false)
    )
    $entry.backupFile = Join-Path 'agents' (Join-Path (Split-Path -Leaf (Split-Path -Parent $nonLoadable)) (Split-Path -Leaf $nonLoadable))
    $changed = $true
  }
  if ($changed) { Write-InstallState $StatePath $Profiles }
}

if ([string]::IsNullOrWhiteSpace($CodexHome)) {
  if (-not [string]::IsNullOrWhiteSpace($env:CODEX_HOME)) {
    $CodexHome = $env:CODEX_HOME
  } else {
    $CodexHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex'
  }
}
$CodexHome = [IO.Path]::GetFullPath($CodexHome)
$pluginRoot = Split-Path -Parent $PSScriptRoot
$templateDir = Join-Path $pluginRoot 'templates/agents'
$policy = Get-Content -LiteralPath (Join-Path $pluginRoot 'routing-policy.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$agentsDir = Join-Path $CodexHome 'agents'
$statePath = Join-Path $CodexHome '.codex-routing-matrix.install-state.json'
$legacyStatePath = Join-Path $CodexHome '.codex-quality-orchestrator.install-state.json'
if (-not (Test-Path -LiteralPath $statePath -PathType Leaf) -and
    (Test-Path -LiteralPath $legacyStatePath -PathType Leaf)) {
  Copy-Item -LiteralPath $legacyStatePath -Destination $statePath -Force -ErrorAction Stop
}
$firstInstall = -not (Test-Path -LiteralPath $statePath -PathType Leaf)

New-Item -ItemType Directory -Path $CodexHome -Force | Out-Null
New-Item -ItemType Directory -Path $agentsDir -Force | Out-Null
$lock = Join-Path $CodexHome '.codex-routing-matrix.install.lock'
$stream = [IO.File]::Open($lock, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try {
  $lockBytes = [Text.Encoding]::UTF8.GetBytes("PID=$PID`nStarted=$(Get-Date -Format o)`n")
  $stream.Write($lockBytes, 0, $lockBytes.Length)
} finally {
  $stream.Dispose()
}

$results = @()
try {
  $stateProfiles = Read-InstallState $statePath
  Convert-StateBackupsToNonLoadable $CodexHome $agentsDir $statePath $stateProfiles

  foreach ($retired in @($policy.retiredProfiles)) {
    $fileName = [string]$retired.profileFile
    $target = Join-Path $agentsDir $fileName
    if (-not $stateProfiles.ContainsKey($fileName)) {
      if (Test-Path -LiteralPath $target -PathType Leaf) {
        $results += [pscustomobject]@{ Agent=$retired.agentType; Status='retired-preserved-external'; Ownership='external'; Backup=$null }
      }
      continue
    }

    $entry = $stateProfiles[$fileName]
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
      $stateProfiles.Remove($fileName)
      Write-InstallState $statePath $stateProfiles
      $results += [pscustomobject]@{ Agent=$retired.agentType; Status='retired-missing'; Ownership=$null; Backup=$null }
      continue
    }
    $targetHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($targetHash -cne [string]$retired.templateSha256) {
      $stateProfiles.Remove($fileName)
      Write-InstallState $statePath $stateProfiles
      $results += [pscustomobject]@{ Agent=$retired.agentType; Status='retired-preserved-modified'; Ownership='external'; Backup=$null }
      continue
    }

    $backup = New-ProfileBackup $target $agentsDir
    if ($entry.ownership -eq 'replaced') {
      $restorePath = Resolve-StateBackupPath $CodexHome $agentsDir $entry.backupFile $fileName
      if (-not (Test-Path -LiteralPath $restorePath -PathType Leaf)) {
        throw "Original profile backup is missing: $restorePath"
      }
      Copy-Item -LiteralPath $restorePath -Destination $target -Force -ErrorAction Stop
      $status = 'retired-restored-original'
    } else {
      Remove-Item -LiteralPath $target -Force -ErrorAction Stop
      $status = 'retired-removed'
    }
    $stateProfiles.Remove($fileName)
    Write-InstallState $statePath $stateProfiles
    $results += [pscustomobject]@{ Agent=$retired.agentType; Status=$status; Ownership=$null; Backup=$backup }
  }

  $actions = @()
  foreach ($property in $policy.namedAgents.PSObject.Properties) {
    $agentType = $property.Name
    $config = $property.Value
    $source = Join-Path $templateDir $config.profileFile
    $target = Join-Path $agentsDir $config.profileFile
    $fileName = [string]$config.profileFile
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "Agent template does not exist: $source"
    }

    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
      $actions += [pscustomobject]@{ Agent=$agentType; Source=$source; Target=$target; Action='install'; Reason=$null }
      continue
    }

    $reason = Test-ProfileContract $target $config $agentType
    $contentMatches =
      (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ceq
      (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($null -eq $reason -and $contentMatches -and
        (-not $Force -or $stateProfiles.ContainsKey($fileName))) {
      $actions += [pscustomobject]@{ Agent=$agentType; Source=$source; Target=$target; Action='keep'; Reason=$null }
      continue
    }
    if ($null -eq $reason -and $stateProfiles.ContainsKey($fileName)) {
      $actions += [pscustomobject]@{ Agent=$agentType; Source=$source; Target=$target; Action='refresh'; Reason='plugin-owned profile content changed' }
      continue
    }
    if ($null -eq $reason -and -not $Force) {
      $actions += [pscustomobject]@{ Agent=$agentType; Source=$source; Target=$target; Action='keep'; Reason='compatible external profile' }
      continue
    }
    $replaceReason = if ($null -eq $reason) { 'forced adoption of compatible external profile' } else { $reason }
    $actions += [pscustomobject]@{ Agent=$agentType; Source=$source; Target=$target; Action='replace'; Reason=$replaceReason }
  }

  $conflicts = @($actions | Where-Object { $_.Action -eq 'replace' })
  if ($conflicts.Count -gt 0 -and -not $Force) {
    $details = ($conflicts | ForEach-Object { "$($_.Target): $($_.Reason)" }) -join [Environment]::NewLine
    throw "Existing agent profiles conflict with the plugin contract. No files were changed. Use -Force to back up and replace them.`n$details"
  }

  foreach ($action in $actions) {
    $fileName = Split-Path -Leaf $action.Target
    if ($action.Action -eq 'keep') {
      $ownership = if ($stateProfiles.ContainsKey($fileName)) { $stateProfiles[$fileName].ownership } else { 'external' }
      $results += [pscustomobject]@{ Agent=$action.Agent; Status='kept'; Ownership=$ownership; Backup=$null }
      continue
    }

    $backup = $null
    if ($action.Action -in @('replace', 'refresh')) {
      $backup = New-ProfileBackup $action.Target $agentsDir
    }

    if (-not $stateProfiles.ContainsKey($fileName)) {
      if ($action.Action -eq 'install') {
        $stateProfiles[$fileName] = [ordered]@{ ownership='created'; backupFile=$null }
      } else {
        $backupRelative = Join-Path 'agents' (Join-Path (Split-Path -Leaf $backup) ($fileName + '.bak'))
        $stateProfiles[$fileName] = [ordered]@{ ownership='replaced'; backupFile=$backupRelative }
      }
      Write-InstallState $statePath $stateProfiles
    }

    Copy-Item -LiteralPath $action.Source -Destination $action.Target -Force -ErrorAction Stop
    $results += [pscustomobject]@{
      Agent=$action.Agent
      Status=$action.Action
      Ownership=$stateProfiles[$fileName].ownership
      Backup=$backup
    }
  }

  foreach ($property in $policy.namedAgents.PSObject.Properties) {
    $target = Join-Path $agentsDir $property.Value.profileFile
    $reason = Test-ProfileContract $target $property.Value $property.Name
    if ($null -ne $reason) { throw "Post-install verification failed: $target`: $reason" }
  }
  $defaultRulesResult = Install-DefaultAgentRules $CodexHome $firstInstall
  $routingMatrixResult = Sync-CanonicalRoutingMatrix $CodexHome $pluginRoot
} finally {
  if (Test-Path -LiteralPath $lock) { Remove-Item -LiteralPath $lock -Force }
}

[pscustomobject]@{
  CodexHome = $CodexHome
  Results = $results
  DefaultRules = $defaultRulesResult
  RoutingMatrix = $routingMatrixResult
  Verified = $true
  NextStep = 'Install and enable the plugin, trust its hooks in /hooks, optionally enable config-guard.ps1 for external config switchers, then start a new task.'
} | ConvertTo-Json -Depth 5
