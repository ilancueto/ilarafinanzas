# Ilara — Plan por etapas (visual Soft Noir + mantenimiento)

Fecha: 2026-08-08  
Base: producto 3.9.9.12 · tema Soft Noir ya aplicado en `styles.css`  
Regla: **una etapa a la vez**. No mezclar con rewrite de `app.js` ni multi-PC.

---

## Etapa 1 — QA visual Soft Noir (actual)

**Objetivo:** que el dark se vea bien en uso real, sin reestructurar archivos.

**Alcance**
- Recorrer Inicio, Movimientos, Previstos, Tarjetas, Proyección, Ajustes
- Dialogs (movimiento, confirmación) y banners (prueba, emergencia, update)
- Controles: mes, inputs, selects, botones, filas, KPIs
- Corregir contraste, fondos claros residuales, hovers rotos, iconos de calendario

**Fuera de alcance:** split de CSS, refactor JS, features nuevas.

**Criterio de listo**
- Ninguna superficie “blanca de tema claro” obvia en las 6 vistas
- Texto legible sobre fondo oscuro
- Botón primario (champagne) y checks con contraste OK
- Logo legible en sidebar

**Salida:** parches en `styles.css` / mínimo en `index.html` o `app.js` si hace falta un color suelto.

---

## Etapa 2 — Modularizar CSS

**Objetivo:** mantener Soft Noir sin un monolito de ~1.7k líneas.

**Alcance**
```text
styles/
  tokens.css      → :root Soft Noir
  shell.css       → app-frame, sidebar, topbar, nav
  components.css  → botones, inputs, panels, filas, dialogs, toast
  views.css       → dashboard, movements, cards, projection, settings
```
- `src/main.ts` importa en orden
- Borrar o vaciar `styles.css` raíz (o reexportar)

**Criterio de listo:** app se ve igual; build/`native:dev` OK.

---

## Etapa 3 — Release del tema (opcional)

**Objetivo:** dejar el Soft Noir en el canal estable.

**Alcance**
- Bump versión (ej. 3.9.9.13)
- CHANGELOG + README si hace falta
- `npm run release:build` / publish solo si se decide publicar

**Criterio de listo:** instalador o commit etiquetado con el tema.

---

## Etapa 4 — Modularizar `app.js` por dominios (después del visual)

**Objetivo:** bajar el monolito sin rewrite de framework.

**Orden sugerido**
1. `domain/cards.js` (lógica + renders de tarjetas)
2. `domain/planned.js`
3. `domain/projection.js` o `ui/render-projection.js`
4. Renders de dashboard / movements
5. `app.js` queda como orquestación + estado + wiring

**Criterio de listo por sub-etapa:** tests existentes pasan; un dominio menos en el monolito.

---

## Etapa 5 — (Futuro) foundation sync / multi-PC

Fuera de este plan visual. Solo cuando el producto local esté estable y se priorice infra.

---

## Estado

| Etapa | Estado |
|-------|--------|
| 1 QA Soft Noir | hecha (validada en app) |
| 2 Split CSS | hecha |
| 3 Release tema | hecha (3.9.9.13 Setup listo; publish GitHub opcional) |
| 4 Modularizar JS | pendiente |
| 5 Multi-PC | fuera de alcance ahora |

### Etapa 1 — parches hechos
- Superficies anidadas: chips/KPIs de tarjetas, forecast, personas, backups usan `--surface-2` (no `--paper`)
- Bordes un poco más visibles (`--line` 0.11)
- Dialogs más oscuros (backdrop + sombra)
- Checkboxes con `accent-color` champagne
- Perfil Hogar en verde soft (`--ok`), no “verde marca viejo”
- Toast alineado a Soft Noir
- Templates de movimiento / confirmation details corregidos
