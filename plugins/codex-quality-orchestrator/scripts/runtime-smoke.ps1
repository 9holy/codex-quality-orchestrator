[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pluginRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $pluginRoot '.codex-plugin\plugin.json') -Raw -Encoding UTF8 |
  ConvertFrom-Json
$pluginId = "$($manifest.name)@codex-quality-orchestrator"
$expectedBaseVersion = ($manifest.version -split '\+', 2)[0]
$codex = (Get-Command codex -ErrorAction Stop).Source

$pluginList = (& $codex plugin list --json | Out-String) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'codex plugin list failed' }

$installed = @($pluginList.installed) | Where-Object { $_.pluginId -eq $pluginId } | Select-Object -First 1
if ($null -eq $installed -or -not $installed.installed -or -not $installed.enabled) {
  throw "$pluginId is not installed and enabled"
}

$installedBaseVersion = ([string]$installed.version -split '\+', 2)[0]
if ($installedBaseVersion -ne $expectedBaseVersion) {
  throw "Installed base version $installedBaseVersion does not match source $expectedBaseVersion"
}

$probePrompt = @(
  'Do not use tools.',
  'If developer context contains [CQO_RULE16_MISMATCH], reply exactly RULE_MISMATCH.',
  'If it contains [CQO_AGENT_PROFILES_MISSING], reply exactly PROFILES_MISSING.',
  'If it contains [CQO_SESSION_START_LOADED], reply exactly HOOK_OK.',
  'Otherwise reply exactly HOOK_MISSING.'
) -join ' '
$probeRaw = & $codex exec --ephemeral --json --dangerously-bypass-hook-trust `
  -m gpt-5.6-sol -c 'model_reasoning_effort="medium"' -s read-only $probePrompt |
  Out-String
if ($LASTEXITCODE -ne 0) { throw 'codex exec runtime probe failed' }

$replies = @($probeRaw -split '\r?\n' | Where-Object { $_.TrimStart().StartsWith('{') } |
  ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.type -eq 'item.completed' -and $_.item.type -eq 'agent_message' } |
  ForEach-Object { $_.item.text })
if ($replies -contains 'RULE_MISMATCH') {
  throw 'Plugin loaded, but the global Rule 16 conflicts with the plugin policy'
}
if ($replies -contains 'PROFILES_MISSING') {
  throw 'Plugin loaded, but one or more named agent profiles are missing'
}
if ($replies -notcontains 'HOOK_OK') {
  throw 'Plugin SessionStart context is absent from the model-visible prompt'
}

[pscustomobject]@{
  Plugin = $pluginId
  Version = $installed.version
  Installed = $true
  Enabled = $true
  SessionStart = 'PASS'
} | ConvertTo-Json -Compress
