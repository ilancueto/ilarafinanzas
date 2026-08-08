# Publica en GitHub Releases el Setup de la versión actual (package.json).
# Requiere: gh auth login (scopes repo)
#
# Uso:
#   powershell -File scripts/publish-github-release.ps1
#   powershell -File scripts/publish-github-release.ps1 -Version 3.9.9.10
#   powershell -File scripts/publish-github-release.ps1 -Draft

param(
  [string]$Version = "",
  [string]$Repo = "ilancueto/ilarafinanzas",
  [switch]$Draft,
  [switch]$Prerelease
)

$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\GitHub CLI;" + $env:Path

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "No se encontró 'gh'. Instalá GitHub CLI e iniciá sesión con: gh auth login"
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $Version) {
  $packageJson = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json
  $Version = [string]$packageJson.version
}

if ($Version -notmatch '^\d+(\.\d+){0,99}$') {
  throw "Versión inválida: $Version"
}

$tag = "v$Version"
$setupName = "Ilara-Finanzas-$Version-Windows-x64-Setup.exe"
$setupPath = Join-Path $projectRoot "release\$setupName"
$sumsPath = Join-Path $projectRoot "release\SHA256SUMS.txt"

if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) {
  throw "No está el Setup: $setupPath`nCorré antes: npm run release:build"
}

# Notas desde CHANGELOG (bloque ## Version) — siempre UTF-8 sin BOM vía notes-file
# (pasar --notes con acentos por argv en Windows suele mojibakear: "AÃ±adido", "â€"")
$notes = "Ilara Finanzas $Version"
$changelogPath = Join-Path $projectRoot "CHANGELOG.md"
if (Test-Path -LiteralPath $changelogPath) {
  $raw = Get-Content -LiteralPath $changelogPath -Raw -Encoding utf8
  $pattern = "(?ms)^## $([regex]::Escape($Version))\b.*?(?=^## |\z)"
  $m = [regex]::Match($raw, $pattern)
  if ($m.Success) {
    $notes = $m.Value.Trim()
  }
}

$notesPath = Join-Path $env:TEMP "ilara-release-notes-$Version.md"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($notesPath, $notes, $utf8NoBom)

$releaseExists = $false
try {
  $null = & gh release view $tag --repo $Repo 2>&1
  if ($LASTEXITCODE -eq 0) { $releaseExists = $true }
} catch {
  $releaseExists = $false
}

if ($releaseExists) {
  Write-Output "La release $tag ya existe. Actualizando notas y assets…"
  & gh release edit $tag --repo $Repo --notes-file $notesPath
  if ($LASTEXITCODE -ne 0) { throw "gh release edit (notas) falló" }
  & gh release upload $tag $setupPath --repo $Repo --clobber
  if ($LASTEXITCODE -ne 0) { throw "gh release upload (setup) falló" }
  if (Test-Path -LiteralPath $sumsPath) {
    & gh release upload $tag $sumsPath --repo $Repo --clobber
  }
  Write-Output "Actualizado: https://github.com/$Repo/releases/tag/$tag"
  exit 0
}

# Asegurar tag remoto (git rev-parse escribe a stderr si no existe → no tumbar con Stop)
$tagExists = $false
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
git -C $projectRoot rev-parse "refs/tags/$tag" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { $tagExists = $true }
$ErrorActionPreference = $prevEap
if (-not $tagExists) {
  git -C $projectRoot tag -a $tag -m "Ilara Finanzas $Version"
  if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el tag $tag" }
  git -C $projectRoot push origin $tag
  if ($LASTEXITCODE -ne 0) { throw "No se pudo pushear el tag $tag" }
}

$ghArgs = @(
  "release", "create", $tag,
  $setupPath,
  "--repo", $Repo,
  "--title", "Ilara Finanzas $Version",
  "--notes-file", $notesPath
)
if (Test-Path -LiteralPath $sumsPath) {
  $ghArgs = @(
    "release", "create", $tag,
    $setupPath,
    $sumsPath,
    "--repo", $Repo,
    "--title", "Ilara Finanzas $Version",
    "--notes-file", $notesPath
  )
}
if ($Draft) { $ghArgs += "--draft" }
if ($Prerelease) { $ghArgs += "--prerelease" }

& gh @ghArgs
if ($LASTEXITCODE -ne 0) {
  throw "gh release create falló con código $LASTEXITCODE"
}

Write-Output "Publicado: https://github.com/$Repo/releases/tag/$tag"
