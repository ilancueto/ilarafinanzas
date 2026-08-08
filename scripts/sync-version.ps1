# Sincroniza la versión de producto (package.json) hacia Cargo, Tauri y app.js.
#
# Producto (package.json): 1–100 segmentos numéricos, ej. 3.2.4.1 o 1.0.0.0.1
# Cargo / Tauri: solo admiten semver de 3 números; el resto va como build metadata:
#   3.2.4.1     ->  3.2.4+1
#   3.2.4.1.2   ->  3.2.4+1.2
#   3.2.5       ->  3.2.5
#
# La UI (APP_VERSION) muestra la versión de producto completa.

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packagePath = Join-Path $projectRoot "package.json"
$cargoPath = Join-Path $projectRoot "src-tauri\Cargo.toml"
$tauriPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"
$appJsPath = Join-Path $projectRoot "app.js"

$packageJson = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
$productVersion = [string]$packageJson.version

if ($productVersion -notmatch '^\d+(\.\d+){0,99}$') {
  throw "Versión de producto inválida: '$productVersion'. Usá solo números y puntos (1 a 100 segmentos), ej. 3.2.4.1"
}

$segments = [System.Collections.Generic.List[string]]::new()
foreach ($part in $productVersion.Split('.')) {
  if ($part -notmatch '^\d+$') {
    throw "Segmento inválido '$part' en la versión $productVersion."
  }
  $segments.Add($part)
}

if ($segments.Count -lt 1 -or $segments.Count -gt 100) {
  throw "La versión debe tener entre 1 y 100 segmentos numéricos."
}

while ($segments.Count -lt 3) {
  $segments.Add('0')
}

$major = $segments[0]
$minor = $segments[1]
$patch = $segments[2]
$cargoVersion = "$major.$minor.$patch"
if ($segments.Count -gt 3) {
  $extra = $segments.GetRange(3, $segments.Count - 3) -join '.'
  $cargoVersion = "$cargoVersion+$extra"
}

$cargo = [System.IO.File]::ReadAllText($cargoPath)
if ($cargo -notmatch '(?m)^version\s*=\s*"[^"]+"') {
  throw "No se encontró version en Cargo.toml"
}
$cargo = [regex]::Replace($cargo, '(?m)^version\s*=\s*"[^"]+"', "version = `"$cargoVersion`"", 1)
[System.IO.File]::WriteAllText($cargoPath, $cargo)

$tauri = [System.IO.File]::ReadAllText($tauriPath)
if ($tauri -notmatch '"version"\s*:\s*"[^"]+"') {
  throw "No se encontró version en tauri.conf.json"
}
$tauri = [regex]::Replace($tauri, '"version"\s*:\s*"[^"]+"', "`"version`": `"$cargoVersion`"", 1)
[System.IO.File]::WriteAllText($tauriPath, $tauri)

$appJs = [System.IO.File]::ReadAllText($appJsPath)
if ($appJs -notmatch 'const APP_VERSION = "[^"]+";') {
  throw "No se encontró APP_VERSION en app.js"
}
$appJs = [regex]::Replace($appJs, 'const APP_VERSION = "[^"]+";', "const APP_VERSION = `"$productVersion`";", 1)
[System.IO.File]::WriteAllText($appJsPath, $appJs)

Write-Output "Versión de producto:      $productVersion"
Write-Output "Cargo / Tauri (semver):  $cargoVersion"
Write-Output "APP_VERSION (UI):        $productVersion"
Write-Output "OK: package.json → Cargo.toml, tauri.conf.json, app.js"
