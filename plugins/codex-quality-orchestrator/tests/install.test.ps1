Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Set-ConflictingLunaProfile {
  param([string]$Source, [string]$Target)
  $text = [IO.File]::ReadAllText($Source, [Text.UTF8Encoding]::new($false))
  $text = $text.Replace('model = "gpt-5.6-luna"', 'model = "gpt-5.5"')
  [IO.File]::WriteAllText($Target, $text, [Text.UTF8Encoding]::new($false))
}

$pluginRoot = Split-Path -Parent $PSScriptRoot
$installScript = Join-Path $pluginRoot 'scripts\install.ps1'
$uninstallScript = Join-Path $pluginRoot 'scripts\uninstall.ps1'
$templateDir = Join-Path $pluginRoot 'templates\agents'
$lunaTemplate = Join-Path $templateDir 'luna-worker.toml'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('codex-quality-orchestrator-install-' + [guid]::NewGuid().ToString('N'))

try {
  $freshHome = Join-Path $tempRoot 'fresh\.codex'
  $first = ((& $installScript -CodexHome $freshHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True $first.Verified 'First install was not verified'
  Assert-True (@($first.Results | Where-Object { $_.Status -eq 'install' -and $_.Ownership -eq 'created' }).Count -eq 3) 'First install did not own three created profiles'
  Assert-True (Test-Path -LiteralPath (Join-Path $freshHome '.codex-quality-orchestrator.install-state.json')) 'First install did not write ownership state'

  $second = ((& $installScript -CodexHome $freshHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($second.Results | Where-Object { $_.Status -eq 'kept' -and $_.Ownership -eq 'created' }).Count -eq 3) 'Second install did not retain ownership'

  $freshRemoved = ((& $uninstallScript -CodexHome $freshHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($freshRemoved.Results | Where-Object { $_.Status -eq 'removed' }).Count -eq 3) 'Fresh uninstall did not remove three owned profiles'
  Assert-True (@(Get-ChildItem -LiteralPath (Join-Path $freshHome 'agents') -Filter '*.toml' -File).Count -eq 0) 'Fresh uninstall left owned profiles'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $freshHome '.codex-quality-orchestrator.install-state.json'))) 'Fresh uninstall left ownership state'

  $externalHome = Join-Path $tempRoot 'external\.codex'
  $externalAgents = Join-Path $externalHome 'agents'
  New-Item -ItemType Directory -Path $externalAgents -Force | Out-Null
  foreach ($template in Get-ChildItem -LiteralPath $templateDir -Filter '*.toml' -File) {
    Copy-Item -LiteralPath $template.FullName -Destination (Join-Path $externalAgents $template.Name)
  }
  $externalInstall = ((& $installScript -CodexHome $externalHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($externalInstall.Results | Where-Object { $_.Status -eq 'kept' -and $_.Ownership -eq 'external' }).Count -eq 3) 'Compatible external profiles were incorrectly claimed'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $externalHome '.codex-quality-orchestrator.install-state.json'))) 'Compatible external profiles created ownership state'
  $externalUninstall = ((& $uninstallScript -CodexHome $externalHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($externalUninstall.Results | Where-Object { $_.Status -eq 'preserved-not-owned' }).Count -eq 3) 'Uninstall did not preserve external profiles'
  Assert-True (@(Get-ChildItem -LiteralPath $externalAgents -Filter '*.toml' -File).Count -eq 3) 'Uninstall removed an external profile'

  $forceHome = Join-Path $tempRoot 'force\.codex'
  $forceAgents = Join-Path $forceHome 'agents'
  $forceLuna = Join-Path $forceAgents 'luna-worker.toml'
  New-Item -ItemType Directory -Path $forceAgents -Force | Out-Null
  Set-ConflictingLunaProfile $lunaTemplate $forceLuna
  $originalHash = (Get-FileHash -LiteralPath $forceLuna -Algorithm SHA256).Hash
  $rejected = $false
  try {
    & $installScript -CodexHome $forceHome | Out-Null
  } catch {
    $rejected = $true
  }
  Assert-True $rejected 'Conflicting profile was not rejected'
  Assert-True ((Get-FileHash -LiteralPath $forceLuna -Algorithm SHA256).Hash -ceq $originalHash) 'Rejected install modified the conflicting profile'
  Assert-True (@(Get-ChildItem -LiteralPath $forceAgents -Filter '*.toml' -File).Count -eq 1) 'Rejected install created another profile'

  $forced = ((& $installScript -CodexHome $forceHome -Force) -join [Environment]::NewLine) | ConvertFrom-Json
  $replaced = @($forced.Results | Where-Object { $_.Agent -eq 'luna_worker' -and $_.Status -eq 'replace' -and $_.Ownership -eq 'replaced' })
  Assert-True ($replaced.Count -eq 1) 'Force install did not record replacement ownership'
  Assert-True (-not [string]::IsNullOrWhiteSpace($replaced[0].Backup)) 'Force install did not create a backup'
  $forceUninstall = ((& $uninstallScript -CodexHome $forceHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($forceUninstall.Results | Where-Object { $_.Status -eq 'removed' }).Count -eq 2) 'Force uninstall did not remove two created profiles'
  Assert-True (@($forceUninstall.Results | Where-Object { $_.Status -eq 'restored-original' }).Count -eq 1) 'Force uninstall did not restore the replaced profile'
  Assert-True ((Get-FileHash -LiteralPath $forceLuna -Algorithm SHA256).Hash -ceq $originalHash) 'Force uninstall restored the wrong profile content'
  Assert-True (@(Get-ChildItem -LiteralPath $forceAgents -Filter '*.toml' -File).Count -eq 1) 'Force uninstall left unexpected profiles'

  $modifiedHome = Join-Path $tempRoot 'modified\.codex'
  & $installScript -CodexHome $modifiedHome | Out-Null
  $modifiedLuna = Join-Path $modifiedHome 'agents\luna-worker.toml'
  Set-ConflictingLunaProfile $lunaTemplate $modifiedLuna
  $modifiedHash = (Get-FileHash -LiteralPath $modifiedLuna -Algorithm SHA256).Hash
  $modifiedUninstall = ((& $uninstallScript -CodexHome $modifiedHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($modifiedUninstall.Results | Where-Object { $_.Status -eq 'preserved-modified' }).Count -eq 1) 'Uninstall did not preserve a modified owned profile'
  Assert-True ((Get-FileHash -LiteralPath $modifiedLuna -Algorithm SHA256).Hash -ceq $modifiedHash) 'Uninstall changed a modified owned profile'
  Assert-True (Test-Path -LiteralPath (Join-Path $modifiedHome '.codex-quality-orchestrator.install-state.json')) 'Modified ownership state was discarded'

  $lockedHome = Join-Path $tempRoot 'locked\.codex'
  New-Item -ItemType Directory -Path $lockedHome -Force | Out-Null
  $lockedState = Join-Path $lockedHome '.codex-quality-orchestrator.install-state.json'
  $lockedInstall = Join-Path $lockedHome '.codex-quality-orchestrator.install.lock'
  [IO.File]::WriteAllText($lockedState, '{invalid state', [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($lockedInstall, 'held', [Text.UTF8Encoding]::new($false))
  $lockErrorType = $null
  try {
    & $installScript -CodexHome $lockedHome | Out-Null
  } catch {
    $lockError = $_.Exception
    if ($null -ne $lockError.InnerException) { $lockError = $lockError.InnerException }
    $lockErrorType = $lockError.GetType().FullName
  }
  Assert-True ($lockErrorType -ceq 'System.IO.IOException') 'Installer read state or targets before acquiring the install lock'

  Write-Output 'PASS ownership-aware install, lock ordering, idempotency, conflict rejection, force restore, and guarded uninstall'
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    $resolved = [IO.Path]::GetFullPath($tempRoot)
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $resolved.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove non-temporary path: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
