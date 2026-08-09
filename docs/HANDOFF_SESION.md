# Handoff Ilara — sesión 2026-08-09

Workspace: `C:\Users\ilaan\Escritorio\Finanzas personales`  
Repo: github.com/ilancueto/ilarafinanzas  
Canal: Estable

## Producto

- Soft Noir (tema oscuro) desde 3.9.9.13
- Drive: botones **Guardar en Drive** / **Cargar de Drive** (no más “Sincronizar ahora” mixto) — 3.9.9.14
- Modularización de `app.js` en módulos (etapa 4)
- Bugfix en curso: pantallas en blanco Movimientos/Previstos + FX

## Versiones publicadas hoy

| Tag | Notas |
|-----|--------|
| v3.9.9.14 | Drive Guardar/Cargar |
| v3.9.9.15 | flags categoryBreakdown en home-ui |
| v3.9.9.16 | cloneState(state) → getState() en cards/planned |
| **siguiente** | buildProjection faltante en home-ui (causa real del blank) + botón export log |

## Bug activo (reproducido)

**Síntoma:** Movimientos y Previstos vacíos (solo filtros/HTML); dólar no actualiza (antes).

**Causa raíz confirmada en smoke test (node):**

```
ReferenceError: buildProjection is not defined
  at renderMiniForecast (home-ui.js)
  at renderDashboard
```

`renderDashboard` → `renderMiniForecast` → `buildProjection(4)` sin inyectar/importar  
→ tira a mitad de `render()` → **nunca llega a `renderMovements` / `renderPlanned`**.

**Fix en working tree:** pasar `buildProjection` al factory de `home-ui` + render por pasos con try/catch por vista + botón **Exportar log de diagnóstico** en Ajustes.

## Arquitectura actual

```
app.js (~orquestación)
├── finance-core.js / state-core.js
├── cards-core.js + cards-ui.js
├── planned-core.js + planned-ui.js
├── projection-ui.js
├── home-ui.js          ← Inicio + listas movimientos
└── movements-ui.js     ← form movimientos + prefs
```

CSS Soft Noir: `styles/{tokens,shell,components,views}.css` via barrel `styles.css`.

Datos locales: `%APPDATA%\com.ilara.finanzas\ilara.db`  
Backups JSON útiles del usuario: `Downloads\ilara-antes-de-drive-2026-08-09.json` (23 tx).

## Cómo probar el fix

```powershell
cd "C:\Users\ilaan\Escritorio\Finanzas personales"
npm run native:dev
# o release:build + publish como 3.9.9.17
```

Ajustes → **Exportar log de diagnóstico** → manda `.log` si sigue fallando.

## Próximos pasos sugeridos

1. Publicar **3.9.9.17** con buildProjection + debug log.
2. Validar Movimientos/Previstos/FX en ambas PCs.
3. Quitar botón de log cuando esté estable.
4. Auditar otros símbolos libres en módulos (`scan-undefined` / smoke render).

## No commitear (ruido)

- `scripts/extract-*.mjs`, `scripts/wire-*.mjs` (one-shot de extracción)
- `tmp/visual-explorations/`

## Commits recientes

- `fdc68f3` / `9becf6f` — 3.9.9.14 modular + Drive
- `a451da8` / `7e0eb2a` — 3.9.9.15 breakdown flags
- `762005e` / `cba10b8` — 3.9.9.16 cloneState(state)
- Working tree: buildProjection + debug log (pendiente release)
