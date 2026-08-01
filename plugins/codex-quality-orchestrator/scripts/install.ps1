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

if ([string]::IsNullOrWhiteSpace($CodexHome)) {
  if (-not [string]::IsNullOrWhiteSpace($env:CODEX_HOME)) {
    $CodexHome = $env:CODEX_HOME
  } else {
    $CodexHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex'
  }
}
$CodexHome = [IO.Path]::GetFullPath($CodexHome)
$pluginRoot = Split-Path -Parent $PSScriptRoot
$templateDir = Join-Path $pluginRoot 'templates\agents'
$policy = Get-Content -LiteralPath (Join-Path $pluginRoot 'routing-policy.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$agentsDir = Join-Path $CodexHome 'agents'
$statePath = Join-Path $CodexHome '.codex-quality-orchestrator.install-state.json'

New-Item -ItemType Directory -Path $CodexHome -Force | Out-Null
New-Item -ItemType Directory -Path $agentsDir -Force | Out-Null
$lock = Join-Path $CodexHome '.codex-quality-orchestrator.install.lock'
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
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
      $backup = Join-Path $agentsDir ((Split-Path -Leaf $action.Target) + '-' + $stamp)
      New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
      $backupFile = Join-Path $backup (Split-Path -Leaf $action.Target)
      Copy-Item -LiteralPath $action.Target -Destination $backupFile -ErrorAction Stop
      $hash = (Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash.ToLowerInvariant()
      [IO.File]::WriteAllText(
        (Join-Path $backup 'SHA256SUMS'),
        ($hash + ' *' + (Split-Path -Leaf $action.Target) + [Environment]::NewLine),
        [Text.UTF8Encoding]::new($false)
      )
    }

    if (-not $stateProfiles.ContainsKey($fileName)) {
      if ($action.Action -eq 'install') {
        $stateProfiles[$fileName] = [ordered]@{ ownership='created'; backupFile=$null }
      } else {
        $backupRelative = Join-Path 'agents' (Join-Path (Split-Path -Leaf $backup) $fileName)
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
} finally {
  if (Test-Path -LiteralPath $lock) { Remove-Item -LiteralPath $lock -Force }
}

[pscustomobject]@{
  CodexHome = $CodexHome
  Results = $results
  Verified = $true
  NextStep = 'Install and enable the plugin, trust its hooks in /hooks, optionally enable config-guard.ps1 for external config switchers, then start a new task.'
} | ConvertTo-Json -Depth 5
