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

$nonce = [guid]::NewGuid().ToString('N')
$proofPath = Join-Path ([IO.Path]::GetTempPath()) ("cqo-runtime-smoke-$nonce.json")
$hadNonce = Test-Path Env:CQO_RUNTIME_SMOKE_NONCE
$previousNonce = $env:CQO_RUNTIME_SMOKE_NONCE
$hadProofPath = Test-Path Env:CQO_RUNTIME_SMOKE_PROOF_PATH
$previousProofPath = $env:CQO_RUNTIME_SMOKE_PROOF_PATH
$hostExitCode = $null
$proof = $null
try {
  if (Test-Path -LiteralPath $proofPath) {
    Remove-Item -LiteralPath $proofPath -Force -ErrorAction Stop
  }
  $env:CQO_RUNTIME_SMOKE_NONCE = $nonce
  $env:CQO_RUNTIME_SMOKE_PROOF_PATH = $proofPath
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $probeRaw = & $codex exec --ephemeral --json -m gpt-5.6-sol `
      -c 'model_reasoning_effort="medium"' -s read-only `
      'Codex Quality Orchestrator runtime smoke probe. Reply with exactly CQO_HOST_PROBE.' 2>&1 |
      Out-String
    $hostExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }
  if (-not (Test-Path -LiteralPath $proofPath -PathType Leaf)) {
    throw "SessionStart Hook proof is absent. Open /hooks, trust the current plugin Hook definition, then retry (host exit $hostExitCode)"
  }
  $proof = Get-Content -LiteralPath $proofPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([int]$proof.schemaVersion -ne 1 -or
      [string]$proof.hookEventName -ne 'SessionStart' -or
      [string]$proof.nonce -ne $nonce -or
      [string]$proof.rule16Status -notin @('injected', 'match', 'refreshed')) {
    throw 'SessionStart Hook proof is invalid or belongs to a different smoke run'
  }
} finally {
  if ($hadNonce) {
    $env:CQO_RUNTIME_SMOKE_NONCE = $previousNonce
  } else {
    Remove-Item Env:CQO_RUNTIME_SMOKE_NONCE -ErrorAction SilentlyContinue
  }
  if ($hadProofPath) {
    $env:CQO_RUNTIME_SMOKE_PROOF_PATH = $previousProofPath
  } else {
    Remove-Item Env:CQO_RUNTIME_SMOKE_PROOF_PATH -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $proofPath) {
    Remove-Item -LiteralPath $proofPath -Force -ErrorAction SilentlyContinue
  }
}

$modelProbeStatus = if ($hostExitCode -eq 0) { 'PASS' } else { 'UNAVAILABLE' }
if ($proof -eq $null) {
  throw 'SessionStart Hook proof was not produced'
}

if (@($proof.missingProfiles).Count -gt 0) {
  throw 'Plugin loaded, but one or more named agent profiles are missing'
}

[pscustomobject]@{
  Plugin = $pluginId
  Version = $installed.version
  Installed = $true
  Enabled = $true
  SessionStartHookTrust = 'PASS'
  PreToolUseHookTrust = 'NOT_VERIFIED'
  SessionStart = 'PASS'
  HostExitCode = $hostExitCode
  ModelProbe = $modelProbeStatus
} | ConvertTo-Json -Compress
