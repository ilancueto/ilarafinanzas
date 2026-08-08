# Empaqueta el instalador Windows (Setup) para distribuir.
# Por defecto NO genera portable (camino instalado = principal).
# Portable legacy:  powershell -File scripts/package-release.ps1 -IncludePortable

param(
  [switch]$IncludePortable
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json
$productVersion = [string]$packageJson.version

if ($productVersion -notmatch '^\d+(\.\d+){0,99}$') {
  throw "La versión de producto '$productVersion' no es válida. Usá números y puntos (hasta 100 segmentos)."
}

$segments = $productVersion.Split('.')
while ($segments.Count -lt 3) { $segments += '0' }
$tauriBase = "$($segments[0]).$($segments[1]).$($segments[2])"
$nativeVersionCandidates = @($tauriBase)
if ($segments.Count -gt 3) {
  $nativeVersionCandidates += "$tauriBase+$($segments[3..($segments.Count-1)] -join '.')"
}

$targetDirectory = Join-Path $projectRoot "src-tauri\target\release"
$portableSource = Join-Path $targetDirectory "ilara-finanzas.exe"
$bundleDirectory = Join-Path $targetDirectory "bundle\nsis"

if (-not (Test-Path -LiteralPath $portableSource -PathType Leaf)) {
  throw "No se encontró el ejecutable release: $portableSource"
}

$setupCandidates = @()
foreach ($ver in $nativeVersionCandidates) {
  $setupCandidates = @(Get-ChildItem -LiteralPath $bundleDirectory -Filter "*_${ver}_x64-setup.exe" -File -ErrorAction SilentlyContinue)
  if ($setupCandidates.Count -ge 1) { break }
}
if ($setupCandidates.Count -eq 0) {
  $setupCandidates = @(Get-ChildItem -LiteralPath $bundleDirectory -Filter "*_x64-setup.exe" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1)
}
if ($setupCandidates.Count -lt 1) {
  throw "No se encontró instalador NSIS en $bundleDirectory"
}
if ($setupCandidates.Count -gt 1) {
  $setupCandidates = @($setupCandidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
}

$releaseDirectory = Join-Path $projectRoot "release"
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null

# Limpiar portables viejos del folder release (salvo que se pidan de nuevo)
Get-ChildItem -LiteralPath $releaseDirectory -Filter "Ilara-Finanzas-*-Portable.exe" -File -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue

$setupDestination = Join-Path $releaseDirectory "Ilara-Finanzas-$productVersion-Windows-x64-Setup.exe"
Copy-Item -LiteralPath $setupCandidates[0].FullName -Destination $setupDestination -Force

$artifacts = @($setupDestination)

if ($IncludePortable) {
  $portableDestination = Join-Path $releaseDirectory "Ilara-Finanzas-$productVersion-Windows-x64-Portable.exe"
  Copy-Item -LiteralPath $portableSource -Destination $portableDestination -Force
  $artifacts += $portableDestination
  Write-Output "AVISO: portable generado (legacy). El camino recomendado es el Setup instalado."
}

$hashLines = $artifacts | ForEach-Object {
  $item = Get-Item -LiteralPath $_
  $stream = [System.IO.File]::OpenRead($item.FullName)
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
  "$hash  $($item.Name)"
}

$hashPath = Join-Path $releaseDirectory "SHA256SUMS.txt"
Set-Content -LiteralPath $hashPath -Value $hashLines -Encoding ascii

Write-Output "Artefactos V$productVersion preparados (instalador = principal):"
Write-Output $setupDestination
if ($IncludePortable) {
  Write-Output $artifacts[1]
}
Write-Output $hashPath
