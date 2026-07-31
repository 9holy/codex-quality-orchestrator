[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pluginRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $pluginRoot)
$marketplacePath = Join-Path $repoRoot '.agents\plugins\marketplace.json'
$node = (Get-Command node -ErrorAction Stop).Source
$python = (Get-Command python -ErrorAction Stop).Source

$jsonFiles = @(
  '.codex-plugin\plugin.json',
  'routing-policy.json',
  'hooks\hooks.json'
)
foreach ($relative in $jsonFiles) {
  Get-Content -LiteralPath (Join-Path $pluginRoot $relative) -Raw -Encoding UTF8 |
    ConvertFrom-Json | Out-Null
}

$nodeFiles = @(
  'hooks\inject-routing-policy.cjs',
  'hooks\enforce-agent-routing.cjs',
  'tests\inject-routing-policy.test.cjs',
  'tests\enforce-agent-routing.test.cjs'
)
foreach ($relative in $nodeFiles) {
  & $node --check (Join-Path $pluginRoot $relative)
  if ($LASTEXITCODE -ne 0) { throw "Node syntax check failed: $relative" }
}

$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
  (Join-Path $pluginRoot 'scripts\runtime-smoke.ps1'),
  [ref]$tokens,
  [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) { throw 'Runtime smoke PowerShell syntax check failed' }

& $python (Join-Path $pluginRoot 'tests\validate_profiles.py')
if ($LASTEXITCODE -ne 0) { throw 'Agent profile validation failed' }

$marketplaceStatus = 'SKIPPED (standalone plugin)'
if (Test-Path -LiteralPath $marketplacePath -PathType Leaf) {
  & $python (Join-Path $pluginRoot 'tests\validate_marketplace.py') $marketplacePath
  if ($LASTEXITCODE -ne 0) { throw 'Repository marketplace validation failed' }
  $marketplaceStatus = 'PASS'
}

& $node (Join-Path $pluginRoot 'tests\enforce-agent-routing.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Routing hook matrix test failed' }

& $node (Join-Path $pluginRoot 'tests\inject-routing-policy.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Session hook contract test failed' }

& (Join-Path $pluginRoot 'tests\install.test.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Installer isolation test failed' }

[pscustomobject]@{
  Plugin = 'codex-quality-orchestrator'
  JSON = 'PASS'
  NodeSyntax = 'PASS'
  PowerShellSyntax = 'PASS'
  Profiles = 'PASS'
  Marketplace = $marketplaceStatus
  RoutingMatrix = 'PASS'
  SessionContract = 'PASS'
  Installer = 'PASS'
} | ConvertTo-Json -Compress
