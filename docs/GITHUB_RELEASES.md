# Publicar Ilara en GitHub (instalador)

Repo: https://github.com/ilancueto/ilarafinanzas

## Camino recomendado

1. Compilar e instalar localmente:
   ```powershell
   npm run release:build
   ```
2. En `release/` queda solo:
   - `Ilara-Finanzas-<versión>-Windows-x64-Setup.exe`
   - `SHA256SUMS.txt`
3. En GitHub → **Releases** → **Draft a new release**:
   - Tag: `v3.9.9.9` (misma versión que `package.json`, con prefijo `v`)
   - Title: `Ilara Finanzas 3.9.9.9`
   - Description: pegá el bloque del `CHANGELOG.md` de esa versión
   - Adjuntá el **Setup.exe** (y opcionalmente `SHA256SUMS.txt`)
   - **Publish release**

## Actualizar en la PC

1. Descargá el Setup de la última Release.
2. Ejecutalo (instala encima).
3. Tus datos siguen en AppData (no se borran).

## Portable

El portable quedó **legacy**. Solo si hace falta:

```powershell
powershell -File scripts/package-release.ps1 -IncludePortable
```

No se sube a Releases salvo emergencia.

## Después (actualizador en la app)

Con el repo público y Releases publicadas se puede agregar “Buscar actualizaciones” leyendo la API de GitHub. Eso es un paso siguiente de código.
