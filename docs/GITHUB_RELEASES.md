# Publicar Ilara en GitHub (instalador)

Repo: https://github.com/ilancueto/ilarafinanzas

## Requisito

```powershell
gh auth login   # una sola vez
gh auth status  # debe figurar ilancueto
```

Si `gh` no se reconoce, reabrí la terminal o usá:

`C:\Program Files\GitHub CLI\gh.exe`

## Camino automático (recomendado)

1. Compilar:
   ```powershell
   npm run release:build
   ```
2. Publicar Release + Setup:
   ```powershell
   npm run release:publish
   ```
   o:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publish-github-release.ps1
   ```

Opcional: `-Version 3.9.9.10`

Eso crea/usa el tag `vX.Y.Z`, publica la Release y sube:

- `Ilara-Finanzas-<versión>-Windows-x64-Setup.exe`
- `SHA256SUMS.txt`

Si la Release ya existe, solo actualiza los archivos (`--clobber`).

## Actualizar en la PC

1. Ajustes → **Buscar actualizaciones**, o
2. Descargá el Setup desde [Releases](https://github.com/ilancueto/ilarafinanzas/releases) e instalá encima.

## Portable

Legacy. Solo si hace falta:

```powershell
powershell -File scripts/package-release.ps1 -IncludePortable
```
