$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json
$version = [string]$packageJson.version

if ($version -notmatch '^\d+\.\d+\.\d+$') {
  throw "La versión $version no es una versión estable."
}

$targetDirectory = Join-Path $projectRoot "src-tauri\target\release"
$portableSource = Join-Path $targetDirectory "ilara-finanzas.exe"
$bundleDirectory = Join-Path $targetDirectory "bundle\nsis"
$setupCandidates = @(Get-ChildItem -LiteralPath $bundleDirectory -Filter "*_$($version)_x64-setup.exe" -File)

if (-not (Test-Path -LiteralPath $portableSource -PathType Leaf)) {
  throw "No se encontró el ejecutable release: $portableSource"
}
if ($setupCandidates.Count -ne 1) {
  throw "Se esperaba un único instalador NSIS para $version y se encontraron $($setupCandidates.Count)."
}

$releaseDirectory = Join-Path $projectRoot "release"
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$portableDestination = Join-Path $releaseDirectory "Ilara-Finanzas-$version-Windows-x64-Portable.exe"
$setupDestination = Join-Path $releaseDirectory "Ilara-Finanzas-$version-Windows-x64-Setup.exe"

Copy-Item -LiteralPath $portableSource -Destination $portableDestination -Force
Copy-Item -LiteralPath $setupCandidates[0].FullName -Destination $setupDestination -Force

$hashLines = Get-ChildItem -LiteralPath $releaseDirectory -Filter "Ilara-Finanzas-*.exe" -File |
  Sort-Object Name |
  ForEach-Object {
    $stream = [System.IO.File]::OpenRead($_.FullName)
    try {
      $algorithm = [System.Security.Cryptography.SHA256]::Create()
      try {
        $hash = ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "")
      } finally {
        $algorithm.Dispose()
      }
    } finally {
      $stream.Dispose()
    }
    "$hash  $($_.Name)"
  }

$hashPath = Join-Path $releaseDirectory "SHA256SUMS.txt"
Set-Content -LiteralPath $hashPath -Value $hashLines -Encoding ascii

Write-Output "Artefactos V$version preparados:"
Write-Output $setupDestination
Write-Output $portableDestination
Write-Output $hashPath
