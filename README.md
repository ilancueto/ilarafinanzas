# Ilara · Finanzas del hogar

Aplicación de escritorio (Windows) para ingresos, gastos, previstos, tarjetas y proyección.  
Datos **locales** (SQLite). Opcional: sync con **tu** Google Drive.

**Repositorio:** [github.com/ilancueto/ilarafinanzas](https://github.com/ilancueto/ilarafinanzas)

## Versión actual

- **Producto:** ver `package.json` (hoy **3.9.9.13** · canal Estable · tema Soft Noir)
- **Distribución:** instalador Windows (**Setup**). El portable se considera legacy.

## Instalar / actualizar

1. Andá a [Releases](https://github.com/ilancueto/ilarafinanzas/releases).
2. Descargá `Ilara-Finanzas-*-Windows-x64-Setup.exe`.
3. Ejecutá el instalador (actualiza encima si ya tenías Ilara).
4. Los datos del hogar quedan en la carpeta de la app (AppData); no se pierden al actualizar.

Guía detallada: [docs/GITHUB_RELEASES.md](docs/GITHUB_RELEASES.md).

## Desarrollo

```powershell
npm install
npm run native:dev      # app en modo dev
npm test
npm run verify
npm run release:build   # build + Setup en release/
```

### Versionado

La versión de producto está en `package.json` (varios segmentos numéricos, ej. `3.9.9.9`).  
`npm run version:sync` la propaga a Cargo/Tauri y `APP_VERSION` en la UI.

## Atajos

- `Ctrl+N` nuevo movimiento  
- `Ctrl+K` buscar en Movimientos  
- `Ctrl+1`…`6` vistas  
- `Ctrl+Enter` guardar movimiento abierto  

## Privacidad

- Sin cuenta obligatoria.  
- Drive usa **tus** credenciales OAuth y un archivo en **tu** Drive.  
- No subas Client Secret ni bases `.db` al repositorio.
