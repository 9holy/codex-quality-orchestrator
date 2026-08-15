[CmdletBinding()]
param([string]$OutputDirectory = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$pluginRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $pluginRoot)
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $repoRoot 'dist'
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)

& (Join-Path $PSScriptRoot 'verify.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Validation failed; packaging stopped' }

$manifest = Get-Content -LiteralPath (Join-Path $pluginRoot '.codex-plugin\plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$archive = Join-Path $OutputDirectory ($manifest.name + '-' + $manifest.version + '.zip')
if (Test-Path -LiteralPath $archive) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
  Move-Item -LiteralPath $archive -Destination ($archive + '.bak-' + $stamp) -ErrorAction Stop
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('codex-routing-matrix-package-' + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $tempRoot -ErrorAction Stop | Out-Null
  $stagedRoot = Join-Path (Join-Path $tempRoot 'stage') $manifest.name
  New-Item -ItemType Directory -Path $stagedRoot -Force | Out-Null
  foreach ($file in Get-ChildItem -LiteralPath $pluginRoot -File -Recurse -Force) {
    $relative = $file.FullName.Substring($pluginRoot.Length).TrimStart([char[]]@('\', '/'))
    $relativeParts = $relative -split '[\\/]+'
    if ($relativeParts | Where-Object { $_ -eq '.backups' -or $_ -match '-\d{8}-\d{9}$' }) {
      continue
    }
    if ($relative -match '(^|[\\/])__pycache__([\\/]|$)' -or
        $file.Extension -ieq '.pyc' -or
        $file.Name -in @('.DS_Store', 'Thumbs.db')) {
      continue
    }
    $destination = Join-Path $stagedRoot $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination -ErrorAction Stop
  }

  $stagedFiles = @(Get-ChildItem -LiteralPath $stagedRoot -File -Recurse -Force)
  $zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in $stagedFiles) {
      $relative = $file.FullName.Substring($stagedRoot.Length).TrimStart([char[]]@('\', '/'))
      $entryName = $manifest.name + '/' + $relative.Replace('\', '/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip,
        $file.FullName,
        $entryName,
        [IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
  } finally {
    if ($null -ne $zip) { $zip.Dispose() }
  }

  $zip = [IO.Compression.ZipFile]::OpenRead($archive)
  try {
    $invalidEntries = @($zip.Entries | Where-Object {
      $_.FullName.Contains('\') -or
        -not $_.FullName.StartsWith($manifest.name + '/', [StringComparison]::Ordinal)
    })
    if ($invalidEntries.Count -gt 0) {
      throw "Archive contains non-portable entries: $($invalidEntries.FullName -join ', ')"
    }
    if ($zip.Entries.Count -ne $stagedFiles.Count) {
      throw "Archive entry count $($zip.Entries.Count) does not match staged file count $($stagedFiles.Count)"
    }
  } finally {
    if ($null -ne $zip) { $zip.Dispose() }
  }

  $extractRoot = Join-Path $tempRoot 'extract'
  Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot -Force
  $standaloneRoot = Join-Path $extractRoot $manifest.name
  $standaloneVerify = Join-Path $standaloneRoot 'scripts\verify.ps1'
  if (-not (Test-Path -LiteralPath $standaloneVerify -PathType Leaf)) {
    throw "Archive does not contain one plugin root: $($manifest.name)"
  }
  & $standaloneVerify
  if ($LASTEXITCODE -ne 0) { throw 'Standalone archive validation failed' }
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
[pscustomobject]@{
  Archive = $archive
  SHA256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  PortableEntries = 'PASS'
  StandaloneVerified = $true
} | ConvertTo-Json -Compress
