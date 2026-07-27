$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '../..')
$source = Join-Path $root 'apps/extension/dist'
$target = Join-Path $root 'apps/extension/tgs-extension.zip'
$storageDir = Join-Path $root 'storage/extension'
$storageTarget = Join-Path $storageDir 'tgs-extension.zip'
if (-not (Test-Path $source)) { throw 'Primero ejecute el build de extension' }
if (-not (Test-Path (Join-Path $source 'manifest.json'))) { throw 'dist/ no contiene manifest.json; el build de la extension fallo' }
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ('tgs-extension-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  Get-ChildItem -LiteralPath $source | Where-Object { $_.Name -notin @('preview.html', 'preview.js') } | Copy-Item -Destination $stage -Recurse
  if (Test-Path $target) { Remove-Item -LiteralPath $target -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $target
} finally {
  if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
New-Item -ItemType Directory -Force -Path $storageDir | Out-Null
Copy-Item -LiteralPath $target -Destination $storageTarget -Force
Write-Output $target
Write-Output $storageTarget