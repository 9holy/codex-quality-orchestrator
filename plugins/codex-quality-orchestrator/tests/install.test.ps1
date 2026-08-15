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
$profileCount = @(Get-ChildItem -LiteralPath $templateDir -Filter '*.toml' -File).Count
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('codex-quality-orchestrator-install-' + [guid]::NewGuid().ToString('N'))

try {
  $freshHome = Join-Path $tempRoot 'fresh\.codex'
  $first = ((& $installScript -CodexHome $freshHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True $first.Verified 'First install was not verified'
  Assert-True (@($first.Results | Where-Object { $_.Status -eq 'install' -and $_.Ownership -eq 'created' }).Count -eq $profileCount) 'First install did not own every created profile'
  Assert-True (Test-Path -LiteralPath (Join-Path $freshHome '.codex-quality-orchestrator.install-state.json')) 'First install did not write ownership state'
  Assert-True ($first.DefaultRules.Status -ceq 'created') 'First install did not create the default agent rules'
  Assert-True ($first.Rule16.Status -ceq 'appended') 'First install did not append the canonical routing rule'
  $firstAgentsText = [IO.File]::ReadAllText((Join-Path $freshHome 'AGENTS.md'), [Text.UTF8Encoding]::new($false))
  Assert-True ($firstAgentsText.StartsWith('## Meta Rule - Conflict Resolution')) 'Default meta rule was not inserted at the beginning'
  Assert-True ($firstAgentsText.Contains('## Implementation')) 'Default implementation rule is missing'

  $second = ((& $installScript -CodexHome $freshHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($second.Results | Where-Object { $_.Status -eq 'kept' -and $_.Ownership -eq 'created' }).Count -eq $profileCount) 'Second install did not retain ownership'
  Assert-True ($second.DefaultRules.Status -ceq 'skipped') 'Default rules were guarded after first install'
  Assert-True ($second.Rule16.Status -ceq 'kept') 'Second install did not retain canonical Rule 16'

  $freshAgents = Join-Path $freshHome 'AGENTS.md'
  $stalePluginRule = [regex]::Replace([IO.File]::ReadAllText($freshAgents, [Text.UTF8Encoding]::new($false)), '(?ms)(^## Codex Quality Routing[^\r\n]*\r?\n).*\z', '$1`nstale plugin content')
  [IO.File]::WriteAllText($freshAgents, $stalePluginRule, [Text.UTF8Encoding]::new($false))
  $refreshedRuleInstall = ((& $installScript -CodexHome $freshHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True ($refreshedRuleInstall.Rule16.Status -ceq 'refreshed') 'Installer did not refresh its own stale routing section'
  Assert-True ([IO.File]::ReadAllText($freshAgents, [Text.UTF8Encoding]::new($false)).Contains('enable super mode')) 'Refreshed routing section did not contain the current Super mode command'

  $numberedPluginRule = [IO.File]::ReadAllText($freshAgents, [Text.UTF8Encoding]::new($false)).Replace('## Codex Quality Routing - Default Multi-Model Quality Team', '## Rule 8 - Default Multi-Model Quality Team')
  [IO.File]::WriteAllText($freshAgents, $numberedPluginRule, [Text.UTF8Encoding]::new($false))
  $migratedInstall = ((& $installScript -CodexHome $freshHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True ($migratedInstall.Rule16.Status -ceq 'migrated-heading') 'Installer did not remove the legacy plugin rule number'
  Assert-True ([IO.File]::ReadAllText($freshAgents, [Text.UTF8Encoding]::new($false)).Contains('## Codex Quality Routing - Default Multi-Model Quality Team')) 'Installer did not restore the unnumbered plugin heading'

  $staleRule = "## Rule 15 - keep`n`nkeep me`n`n## Rule 16 - user rule`n`nuser content`n`n## Rule 17 - keep`n`nkeep me too`n"
  [IO.File]::WriteAllText($freshAgents, $staleRule, [Text.UTF8Encoding]::new($false))
  $syncedInstall = ((& $installScript -CodexHome $freshHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True ($syncedInstall.Rule16.Status -ceq 'appended') 'Installer did not append the plugin rule'
  Assert-True (-not [string]::IsNullOrWhiteSpace($syncedInstall.Rule16.Backup)) 'Rule insertion did not back up AGENTS.md'
  $syncedText = [IO.File]::ReadAllText($freshAgents, [Text.UTF8Encoding]::new($false))
  Assert-True ($syncedText.Contains('## Rule 15 - keep')) 'Rule 16 synchronization removed the preceding rule'
  Assert-True ($syncedText.Contains('## Rule 16 - user rule')) 'Installer replaced a user Rule 16'
  Assert-True ($syncedText.Contains('## Rule 17 - keep')) 'Rule 16 synchronization removed the following rule'
  Assert-True ($syncedText.Contains('## Codex Quality Routing - Default Multi-Model Quality Team')) 'Installer did not append the unnumbered plugin rule'
  Assert-True (-not $syncedText.Contains('## Meta Rule - Conflict Resolution')) 'Default rules were restored after first install'
  Assert-True (Test-Path -LiteralPath (Join-Path $syncedInstall.Rule16.Backup 'AGENTS.md') -PathType Leaf) 'Rule 16 backup file is missing'

  $freshLuna = Join-Path $freshHome 'agents\luna-worker.toml'
  $localEdit = [IO.File]::ReadAllText($freshLuna, [Text.UTF8Encoding]::new($false)) + "`n# local managed edit`n"
  [IO.File]::WriteAllText($freshLuna, $localEdit, [Text.UTF8Encoding]::new($false))
  $localEditHash = (Get-FileHash -LiteralPath $freshLuna -Algorithm SHA256).Hash
  $refreshedInstall = ((& $installScript -CodexHome $freshHome) -join [Environment]::NewLine) | ConvertFrom-Json
  $refreshedProfile = @($refreshedInstall.Results | Where-Object { $_.Agent -ceq 'luna_worker' })
  $refreshEvidence = $refreshedInstall.Results | ConvertTo-Json -Compress
  Assert-True ($refreshedProfile.Count -eq 1) "Profile refresh returned an unexpected result set: $refreshEvidence"
  Assert-True ($refreshedProfile[0].Status -ceq 'refresh') "Plugin-owned profile content was not refreshed: $refreshEvidence"
  Assert-True ($refreshedProfile[0].Ownership -ceq 'created') "Profile refresh changed ownership: $refreshEvidence"
  Assert-True (-not [string]::IsNullOrWhiteSpace($refreshedProfile[0].Backup)) 'Profile refresh did not create a backup'
  $refreshBackupFile = Join-Path $refreshedProfile[0].Backup 'luna-worker.toml.bak'
  Assert-True ((Get-FileHash -LiteralPath $refreshBackupFile -Algorithm SHA256).Hash -ceq $localEditHash) 'Profile refresh backup did not preserve prior content'
  Assert-True ((Get-FileHash -LiteralPath $freshLuna -Algorithm SHA256).Hash -ceq (Get-FileHash -LiteralPath $lunaTemplate -Algorithm SHA256).Hash) 'Profile refresh did not install the current template'

  $freshRemoved = ((& $uninstallScript -CodexHome $freshHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($freshRemoved.Results | Where-Object { $_.Status -eq 'removed' }).Count -eq $profileCount) 'Fresh uninstall did not remove every owned profile'
  Assert-True (@(Get-ChildItem -LiteralPath (Join-Path $freshHome 'agents') -Filter '*.toml' -File).Count -eq 0) 'Fresh uninstall left owned profiles'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $freshHome '.codex-quality-orchestrator.install-state.json'))) 'Fresh uninstall left ownership state'

  $externalHome = Join-Path $tempRoot 'external\.codex'
  $externalAgents = Join-Path $externalHome 'agents'
  New-Item -ItemType Directory -Path $externalAgents -Force | Out-Null
  foreach ($template in Get-ChildItem -LiteralPath $templateDir -Filter '*.toml' -File) {
    Copy-Item -LiteralPath $template.FullName -Destination (Join-Path $externalAgents $template.Name)
  }
  $externalLuna = Join-Path $externalAgents 'luna-worker.toml'
  $externalEdit = [IO.File]::ReadAllText($externalLuna, [Text.UTF8Encoding]::new($false)) + "`n# external custom edit`n"
  [IO.File]::WriteAllText($externalLuna, $externalEdit, [Text.UTF8Encoding]::new($false))
  $externalHashes = @{}
  foreach ($profile in Get-ChildItem -LiteralPath $externalAgents -Filter '*.toml' -File) {
    $externalHashes[$profile.Name] = (Get-FileHash -LiteralPath $profile.FullName -Algorithm SHA256).Hash
  }
  $externalInstall = ((& $installScript -CodexHome $externalHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($externalInstall.Results | Where-Object { $_.Status -eq 'kept' -and $_.Ownership -eq 'external' }).Count -eq $profileCount) 'Compatible external profiles were incorrectly claimed'
  Assert-True ((Get-FileHash -LiteralPath $externalLuna -Algorithm SHA256).Hash -ceq $externalHashes['luna-worker.toml']) 'Compatible external profile was overwritten'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $externalHome '.codex-quality-orchestrator.install-state.json'))) 'Compatible external profiles created ownership state'
  $externalUninstall = ((& $uninstallScript -CodexHome $externalHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($externalUninstall.Results | Where-Object { $_.Status -eq 'preserved-not-owned' }).Count -eq $profileCount) 'Uninstall did not preserve external profiles'
  Assert-True (@(Get-ChildItem -LiteralPath $externalAgents -Filter '*.toml' -File).Count -eq $profileCount) 'Uninstall removed an external profile'

  $adoptedInstall = ((& $installScript -CodexHome $externalHome -Force) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($adoptedInstall.Results | Where-Object { $_.Status -eq 'replace' -and $_.Ownership -eq 'replaced' }).Count -eq $profileCount) 'Force install did not adopt every compatible external profile'
  $adoptedUninstall = ((& $uninstallScript -CodexHome $externalHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($adoptedUninstall.Results | Where-Object { $_.Status -eq 'restored-original' }).Count -eq $profileCount) 'Force uninstall did not restore adopted profiles'
  foreach ($profile in Get-ChildItem -LiteralPath $externalAgents -Filter '*.toml' -File) {
    Assert-True ((Get-FileHash -LiteralPath $profile.FullName -Algorithm SHA256).Hash -ceq $externalHashes[$profile.Name]) "Force uninstall restored the wrong external profile: $($profile.Name)"
  }

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
  Assert-True (@($forceUninstall.Results | Where-Object { $_.Status -eq 'removed' }).Count -eq ($profileCount - 1)) 'Force uninstall did not remove created profiles'
  Assert-True (@($forceUninstall.Results | Where-Object { $_.Status -eq 'restored-original' }).Count -eq 1) 'Force uninstall did not restore the replaced profile'
  Assert-True ((Get-FileHash -LiteralPath $forceLuna -Algorithm SHA256).Hash -ceq $originalHash) 'Force uninstall restored the wrong profile content'
  Assert-True (@(Get-ChildItem -LiteralPath $forceAgents -Filter '*.toml' -File).Count -eq 1) 'Force uninstall left unexpected profiles'

  $modifiedHome = Join-Path $tempRoot 'modified\.codex'
  & $installScript -CodexHome $modifiedHome | Out-Null
  $modifiedLuna = Join-Path $modifiedHome 'agents\luna-worker.toml'
  $modifiedText = [IO.File]::ReadAllText($modifiedLuna, [Text.UTF8Encoding]::new($false)) + "`n# user modified but contract compatible`n"
  [IO.File]::WriteAllText($modifiedLuna, $modifiedText, [Text.UTF8Encoding]::new($false))
  $modifiedHash = (Get-FileHash -LiteralPath $modifiedLuna -Algorithm SHA256).Hash
  $modifiedUninstall = ((& $uninstallScript -CodexHome $modifiedHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($modifiedUninstall.Results | Where-Object { $_.Status -eq 'preserved-modified' }).Count -eq 1) 'Uninstall did not preserve a modified owned profile'
  Assert-True ((Get-FileHash -LiteralPath $modifiedLuna -Algorithm SHA256).Hash -ceq $modifiedHash) 'Uninstall changed a modified owned profile'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $modifiedHome '.codex-quality-orchestrator.install-state.json'))) 'Modified ownership state was not discarded'
  $modifiedReinstall = ((& $installScript -CodexHome $modifiedHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($modifiedReinstall.Results | Where-Object { $_.Agent -eq 'luna_worker' -and $_.Status -eq 'kept' -and $_.Ownership -eq 'external' }).Count -eq 1) 'Reinstall did not treat the preserved custom profile as external'
  Assert-True ((Get-FileHash -LiteralPath $modifiedLuna -Algorithm SHA256).Hash -ceq $modifiedHash) 'Reinstall overwrote a preserved custom profile'

  $legacyHome = Join-Path $tempRoot 'legacy\.codex'
  $legacyAgents = Join-Path $legacyHome 'agents'
  $legacyBackupDir = Join-Path $legacyAgents 'sol-reviewer.toml-20260801-000000000'
  New-Item -ItemType Directory -Path $legacyBackupDir -Force | Out-Null
  $reviewerTemplate = Join-Path $templateDir 'sol-reviewer.toml'
  Copy-Item -LiteralPath $reviewerTemplate -Destination (Join-Path $legacyAgents 'sol-reviewer.toml')
  $originalReviewer = "name = `"sol_reviewer`"`nmodel = `"gpt-5.6-sol`"`n# original external profile`n"
  [IO.File]::WriteAllText((Join-Path $legacyBackupDir 'sol-reviewer.toml'), $originalReviewer, [Text.UTF8Encoding]::new($false))
  $legacyState = [ordered]@{
    schemaVersion = 1
    profiles = [ordered]@{
      'sol-reviewer.toml' = [ordered]@{
        ownership = 'replaced'
        backupFile = 'agents\sol-reviewer.toml-20260801-000000000\sol-reviewer.toml'
      }
    }
  } | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText((Join-Path $legacyHome '.codex-quality-orchestrator.install-state.json'), $legacyState + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  $legacyInstall = ((& $installScript -CodexHome $legacyHome) -join [Environment]::NewLine) | ConvertFrom-Json
  Assert-True (@($legacyInstall.Results | Where-Object { $_.Agent -eq 'sol_reviewer' -and $_.Status -eq 'kept' -and $_.Ownership -eq 'replaced' }).Count -eq 1) 'Upgrade did not reactivate the managed Sol reviewer'
  Assert-True ((Get-FileHash -LiteralPath (Join-Path $legacyAgents 'sol-reviewer.toml') -Algorithm SHA256).Hash -ceq (Get-FileHash -LiteralPath $reviewerTemplate -Algorithm SHA256).Hash) 'Upgrade changed the active Sol reviewer'
  Assert-True (Test-Path -LiteralPath (Join-Path $legacyBackupDir 'sol-reviewer.toml.bak') -PathType Leaf) 'Legacy loadable backup was not converted to .bak'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $legacyBackupDir 'sol-reviewer.toml') -PathType Leaf)) 'Legacy loadable backup still shadows an agent profile'
  $legacyStateAfter = Get-Content -LiteralPath (Join-Path $legacyHome '.codex-quality-orchestrator.install-state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert-True ($legacyStateAfter.profiles.PSObject.Properties.Name -contains 'sol-reviewer.toml') 'Reactivated Sol reviewer lost ownership state'
  Assert-True ([string]$legacyStateAfter.profiles.'sol-reviewer.toml'.backupFile -like '*.toml.bak') 'Reactivated reviewer did not retain a non-loadable restore backup'

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

  Write-Output 'PASS ownership-aware install, reviewer reactivation, non-loadable backups, lock ordering, and guarded uninstall'
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
