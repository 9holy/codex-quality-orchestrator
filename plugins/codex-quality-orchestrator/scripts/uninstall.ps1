[CmdletBinding()]
param([string]$CodexHome = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
  if ($Profiles.Count -eq 0) {
    if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Force }
    return
  }

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

function New-ProfileBackup {
  param([string]$Target, [string]$AgentsDir)
  $fileName = Split-Path -Leaf $Target
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
  $backup = Join-Path $AgentsDir ($fileName + '-' + $stamp)
  New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
  $backupFile = Join-Path $backup $fileName
  Copy-Item -LiteralPath $Target -Destination $backupFile -ErrorAction Stop
  $hash = (Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText(
    (Join-Path $backup 'SHA256SUMS'),
    ($hash + ' *' + $fileName + [Environment]::NewLine),
    [Text.UTF8Encoding]::new($false)
  )
  return $backup
}

function Resolve-RestorePath {
  param([string]$CodexHome, [string]$AgentsDir, [string]$RelativePath, [string]$FileName)
  if ([string]::IsNullOrWhiteSpace($RelativePath) -or [IO.Path]::IsPathRooted($RelativePath)) {
    throw "Invalid restore path for $FileName"
  }
  $resolved = [IO.Path]::GetFullPath((Join-Path $CodexHome $RelativePath))
  $agentsPrefix = [IO.Path]::GetFullPath($AgentsDir).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($agentsPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Restore path escapes the agents directory: $RelativePath"
  }
  if ((Split-Path -Leaf $resolved) -cne $FileName) {
    throw "Restore file name does not match $FileName"
  }
  return $resolved
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
$agentsDir = Join-Path $CodexHome 'agents'
$statePath = Join-Path $CodexHome '.codex-quality-orchestrator.install-state.json'
$lock = Join-Path $CodexHome '.codex-quality-orchestrator.install.lock'

New-Item -ItemType Directory -Path $CodexHome -Force | Out-Null
New-Item -ItemType Directory -Path $agentsDir -Force | Out-Null
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
  $remainingProfiles = @{}
  foreach ($name in $stateProfiles.Keys) { $remainingProfiles[$name] = $stateProfiles[$name] }
  $templates = @(Get-ChildItem -LiteralPath $templateDir -Filter '*.toml' -File)
  $restorePaths = @{}

  foreach ($template in $templates) {
    if (-not $stateProfiles.ContainsKey($template.Name)) { continue }
    $entry = $stateProfiles[$template.Name]
    if ($entry.ownership -eq 'replaced') {
      $restorePath = Resolve-RestorePath $CodexHome $agentsDir $entry.backupFile $template.Name
      if (-not (Test-Path -LiteralPath $restorePath -PathType Leaf)) {
        throw "Original profile backup is missing: $restorePath"
      }
      $restorePaths[$template.Name] = $restorePath
    }
  }

  foreach ($template in $templates) {
    $target = Join-Path $agentsDir $template.Name
    if (-not $stateProfiles.ContainsKey($template.Name)) {
      $status = if (Test-Path -LiteralPath $target -PathType Leaf) { 'preserved-not-owned' } else { 'missing-not-owned' }
      $results += [pscustomobject]@{ File=$template.Name; Status=$status; Backup=$null; RestoredFrom=$null }
      continue
    }

    $entry = $stateProfiles[$template.Name]
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
      if ($entry.ownership -eq 'replaced') {
        Copy-Item -LiteralPath $restorePaths[$template.Name] -Destination $target -Force -ErrorAction Stop
        $status = 'restored-original'
      } else {
        $status = 'missing'
      }
      $remainingProfiles.Remove($template.Name)
      Write-InstallState $statePath $remainingProfiles
      $results += [pscustomobject]@{
        File=$template.Name
        Status=$status
        Backup=$null
        RestoredFrom=$restorePaths[$template.Name]
      }
      continue
    }

    $templateHash = (Get-FileHash -LiteralPath $template.FullName -Algorithm SHA256).Hash
    $targetHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($templateHash -cne $targetHash) {
      $remainingProfiles.Remove($template.Name)
      Write-InstallState $statePath $remainingProfiles
      $results += [pscustomobject]@{
        File=$template.Name
        Status='preserved-modified'
        Backup=$null
        RestoredFrom=$restorePaths[$template.Name]
      }
      continue
    }

    $backup = New-ProfileBackup $target $agentsDir
    if ($entry.ownership -eq 'created') {
      Remove-Item -LiteralPath $target -Force -ErrorAction Stop
      $status = 'removed'
      $restoredFrom = $null
    } else {
      Copy-Item -LiteralPath $restorePaths[$template.Name] -Destination $target -Force -ErrorAction Stop
      $status = 'restored-original'
      $restoredFrom = $restorePaths[$template.Name]
    }
    $remainingProfiles.Remove($template.Name)
    Write-InstallState $statePath $remainingProfiles
    $results += [pscustomobject]@{
      File=$template.Name
      Status=$status
      Backup=$backup
      RestoredFrom=$restoredFrom
    }
  }
} finally {
  if (Test-Path -LiteralPath $lock) { Remove-Item -LiteralPath $lock -Force }
}

[pscustomobject]@{
  CodexHome = $CodexHome
  Results = $results
  Note = 'Only plugin-owned profiles were removed or restored. External and modified profiles were preserved.'
} | ConvertTo-Json -Depth 5
