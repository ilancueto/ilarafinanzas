# Historial de cambios

## 3.9.9.12 — Estable — 2026-08-08

### Actualizaciones (nivel B)
- Descarga del **Setup dentro de la app** (temp), con **SHA-256** si hay `SHA256SUMS` / digest en la Release.
- **Instalar y reiniciar**: lanza el NSIS con `/S` y cierra Ilara.
- Fallback: abrir Setup en el navegador.
- Banner y Ajustes con botones Descargar / Instalar.

### UX
- Ajustes → Categorías: lista compacta (12) + **Ver todas / Ver menos**.

## 3.9.9.11 — Estable — 2026-08-07

### Corregido
- Notas de GitHub Releases en **UTF-8** (`publish-github-release.ps1` con `--notes-file`).

### Confianza / mes cerrado
- Guardas al modificar con mes cerrado (movimientos, previstos, tarjetas/resumen).

### Drive
- Estado multilínea (última sync relativa, cambios locales) y conflictos más claros.

### UX
- Categorías en Inicio: **Ver todas / Ver menos**.
- Desglose **por persona** en Inicio.
- Filtros de Movimientos y Previstos **recordados** entre sesiones.
- **CSV de este mes** desde Movimientos.
- Historial reciente de respaldos en Ajustes (re-descarga de los últimos).

### Actualizaciones
- Chequeo **automático al abrir** la app (sin molestar si estás al día).
- **Banner** + botón «Descargar Setup nuevo» cuando hay Release más nueva.
- «Después» oculta el aviso para esa versión (vuelve si sale otra).

### Tarjetas / proyección
- Cuentas corrientes: auto-marca por nombre (CC / cuenta corriente) + copy más claro.
- Desglose **cuotas · fijos · compras** en hero y detalle; cargos agrupados por tipo.
- Proyección: toggle **Incluir tarjetas (plásticos)** y escenario **¿y si baja el ingreso? (−5%…−30%)**.

## 3.9.9.10 — Estable — 2026-08-07

### Añadido
- Ajustes → **Buscar actualizaciones**: consulta la última Release en GitHub y ofrece abrir el Setup.
- Botón **Ver Releases en GitHub**.
- CSP y comando nativo para abrir URLs en el navegador.

## 3.9.9.9 — Estable (cierre de pulido UX) — 2026-08-07

### Distribución
- Camino principal: **instalador Windows (Setup)** vía [GitHub Releases](https://github.com/ilancueto/ilarafinanzas/releases).
- Portable: **legacy** (solo con `-IncludePortable` en el script de empaquetado).

Línea estable de producto tras el alpha V4. Incluye perfiles de prueba, movimientos confirmados, previstos, tarjetas/CC y el pack de UX chica:

- **Copiar del mes anterior** (movimientos una sola vez → mes activo, pagados, con deshacer).
- **Plantillas rápidas** al crear movimiento (Sueldo, Alquiler, Super…).
- **Ctrl+K** busca en Movimientos.
- **Vencimientos de este mes** en Inicio (vencido / hoy / próximo).
- Comparación **gastos e ingresos** vs mes anterior.
- **Deshacer** al borrar cargo de tarjeta.
- **Respaldo JSON automático** al cerrar el mes.

### Nota
La fundación multi-PC / outbox / writes incrementales queda para una línea posterior (ex-V4 infra).

## 4.0.0.5 — V4 Alpha — 2026-08-07

### Cambiado
- Previstos: **una sola fecha** (calendario); el mes se deduce de ahí (sin campo “Mes” aparte).
- Controles `select` / `date` / `month` con estilo más limpio (flecha SVG en selects, fechas sin chevron doble).

## 4.0.0.4 — V4 Alpha (QA) — 2026-08-07

### Corregido / mejorado (feedback QA)
- Inicio: **Últimos movimientos** del mes (6 recientes, sin tilde de cobro/pago).
- Previstos y movimientos: **fecha estimada** con calendario (sin día 31 en febrero).
- Tarjetas: botón **Eliminar**; **límite** bloquea cargos que lo superen.
- Compras usan el **mes del resumen según cierre** de la tarjeta.
- Apartado renombrado a **Cuentas corrientes**.
- Estilos más limpios en `select`, `month` y `date`.

## 4.0.0.3 — V4 Alpha.3 + Alpha.4 — 2026-08-07

### Alpha.3 — Confianza / datos
- **Copia de emergencia**: banner + panel en Ajustes (aplicar a SQLite / exportar / descartar).
- Mensajes de **Google Drive** más claros; en perfil de prueba indica que Drive está pausado.
- Checkbox cuenta corriente más compacto.

### Alpha.4 — UX
- **Duplicar** movimiento desde el diálogo de edición.
- Aviso en Previstos si hay planes en **otros meses**.
- **Generar resumen** de tarjeta: preview con confirmación (sin `prompt` del sistema) y crea pagado.
- **Deshacer** al eliminar un previsto.

## 4.0.0.2 — V4 Alpha.2 — 2026-08-07

### Cambiado / añadido
- **Movimientos nuevos** quedan **cobrados/pagados al guardar** (si aún no se cumplió, usá Previstos).
- Form **+ Nuevo**: menos lag (no re-render con el diálogo abierto, sin `form.reset`, selects cacheados).
- **Cuenta Corriente Mara**: tarjetas con flag “no sumar” (auto si el nombre es CC Mara) fuera del total de plásticos; apartado propio en Tarjetas.

## 4.0.0.1 — V4 Alpha.1 (base) — 2026-08-07

### Añadido — Perfil de prueba
- En **Ajustes → Perfil de trabajo**: **Hogar (reales)** vs **Perfil de prueba**.
- Cada perfil usa su propia base SQLite (`ilara.db` / `ilara-prueba.db`); no se mezclan datos.
- Banner amarillo mientras estás en prueba; botón para volver a Hogar.
- **Vaciar prueba** borra solo el sandbox.
- Google Drive **solo opera en Hogar** (en prueba no sube ni baja).
- Copia de emergencia de localStorage también va por perfil.

## 3.3.9 — 2026-08-07

### Corregido
- **Guardar desde Previstos fallaba en SQLite**: la vista `planned` no estaba permitida en la validación del backend → toast de “SQLite no respondió” y solo copia de emergencia.
- Filas de Previstos: el nombre salía cortado (“Su…”) porque usaban el grid de Movimientos (columna del tilde de pagado).
- El toast de error de guardado ahora muestra el motivo real del backend.

## 3.3.8 — 2026-08-07

### Corregido
- En **Previstos**, el vacío decía “agregá un previsto” pero el botón abría el form de **Movimientos** (el gasto no aparecía en Previstos).
- Tras guardar un previsto de otro mes, la app cambia al mes del plan para que se vea al toque.

## 3.3.7 — 2026-08-07

### Corregido
- **Editar ingreso/gasto** actualiza la misma fila (ya no duplica).
- El alcance por defecto al editar es **toda la serie**, no “partir” en una serie nueva.
- “Este mes y los siguientes” solo crea serie nueva si hay meses anteriores que preservar; limpia huérfanas del mes activo.

## 3.3.6 — 2026-08-07

### Cambiado / corregido
- **Disponible** = saldo al momento (cobrado − pagado), no el plan completo del mes.
- Editar movimiento: la **categoría/persona/nombre** se actualizan a la primera (sync de ocurrencias materializadas).
- Diálogo de movimiento más rápido al abrir; selects no se reconstruyen si no cambió el catálogo.
- Con el form abierto, un re-render ya no resetea la categoría del selector.

## 3.3.5 — 2026-08-06

### Añadido — Previstos
- Nueva pestaña **Previstos**: ingresos/gastos esperados del mes (no son movimientos hasta confirmar).
- **Confirmar**: pregunta el monto (editable) y al confirmar crea el movimiento real (marcado cobrado/pagado).
- **Editar plan** desde la confirmación, o **No se cumplió** (descarta el mes sin crear movimiento).
- Recurrencia: solo este mes o todos los meses (con “hasta” opcional).
- Atajos: Ctrl+3 Previstos; menú Ver actualizado.

## 3.3.4 — 2026-08-06

### Corregido
- Los formularios (ingreso/gasto, tarjetas, etc.) **ya no se cierran** al hacer clic afuera ni con Escape.
- Solo se cierran con **×**, **Cancelar** o al guardar.

### Añadido de paso
- Recuerda la última categoría, persona, tipo y modalidad al cargar un movimiento nuevo.
- **Ctrl+Enter** (o Cmd+Enter) guarda el movimiento abierto.

### Nota de versión
Línea de producto reencuadrada a 3.3.x.

## 3.7.3 — 2026-08-06

### Cambiado — Proyección

- Se sacó el KPI engañoso de “compromisos fijos” (sumaba todos los meses del horizonte).
- Desglose **interactivo de gastos por categoría** del mes elegido.
- Filtros: Todos / Mensuales / Cuotas / Una vez.
- Clic en mes del gráfico o de la lista → actualiza el desglose.
- Clic en categoría → detalle de movimientos; doble clic en mes → abre Movimientos.
- Lista mes a mes muestra **ingresos − gastos** (no “fijos acumulados”).

## 3.7.2 — 2026-08-06

### Cambiado — un solo monto por movimiento

- Marcar cobrado/pagado es **un clic** (sin diálogo de “importe real”).
- El monto cargado es el final; cobrado/pagado es solo estado.
- Totales e UI ya no muestran “previsto ≠ real”.
- Textos: “Ingresos / Gastos / Disponible” (sin “previstos”).
- CSV con columna única “Monto”.

## 3.7.1 — 2026-08-06

### Corregido

- OAuth Google en Windows: abrir el navegador ya no corta la URL en los `&` (provocaba `Error 400: invalid_request`).
- Validación básica del Client ID y trim de credenciales al conectar.

## 3.7.0 — 2026-08-06

### Añadido — Google Drive sync

- Conexión OAuth a Google Drive (Client ID/Secret propios, una vez).
- Archivo remoto `ilara-sync.json` (alcance `drive.file`).
- **Sync automática**: sube tras cambios (debounce) y baja al abrir si la nube es más nueva.
- Interruptor de sync automática, “Sincronizar ahora”, desconectar.
- Detección de conflicto si ambas PCs tienen cambios distintos.
- Respaldo local “antes-de-drive” al aplicar una copia remota interactiva.

### Nota

No es sync operacional en tiempo real (V4). Es la última snapshot compartida, con el mínimo de clics.

## 3.2.6 — 2026-08-06

### Añadido / rediseño Tarjetas

- Lista de tarjetas (tabla) + **detalle al click** (master/detail).
- Hero **Carga de este mes** con desglose cuotas/fijos/compras y ranking por tarjeta.
- **Límite**, día de **cierre** y **vencimiento** (alta y edición).
- **Generar resumen**: crea un gasto en Movimientos con monto editable (percepciones).
- Próximos cierres y “cuotas que quedan” en el detalle de cada tarjeta.
- Se sacaron los KPIs de “próximos 3 meses / horizonte” del resumen general.

## 3.2.5.1 — 2026-08-06

### Añadido

- Versionado de producto multi-segmento (hasta 100 números en `package.json`).
- `npm run version:sync` mapea a Cargo/Tauri semver (`3.2.5.1` → `3.2.5+1`).
- Instaladores nombrados con la versión de producto completa.

### Nota

La mini proyección de tarjetas entra en la línea 3.2.5.x.

## 3.2.5 — 2026-08-06

### Añadido

- Mini proyección de **tarjetas** mes a mes (cuotas pendientes + fijos).
- Resumen: carga de este mes, próximos 3 meses y total del horizonte (3–24 meses).
- Las cuotas largas entran en la planificación futura (no solo el saldo restante).

## 3.2.4 — 2026-08-06

### Añadido

- Sección **Tarjetas de crédito** (ledger aparte: no suma a KPIs del hogar ni proyección).
- Planes en cuotas (total + N cuotas, restantes, marcar cuota pagada).
- Gastos fijos de tarjeta en **ARS o USD**.
- Tipo de cambio USD→ARS por red (estimativo) y override manual por banco.
- Formato monetario es-AR con puntos de miles y coma decimal en toda la app.

## 3.2.3 — 2026-08-06

### Mejorado

- Interfaz desktop premium: denser layout, tipografía de sistema (Segoe UI), menos “web brochure”.
- Sidebar y topbar con aspecto de aplicación nativa; logo Ilara conservado.
- Bottom nav y botón flotante solo en pantallas chicas.
- Menú nativo de Windows (Archivo / Ver / Mes / Ayuda) y atajos de teclado.
- Titlebar del sistema operativo.

### Corregido

- No se puede excluir un mes si el movimiento ya está pagado/cobrado (hay que desmarcar antes).
- `materializeOccurrence` tolera registros crudos y ya no revienta en rutas de fallback.
- Al eliminar una persona se considera también el historial de ocurrencias.

## 3.2.1 — 2026-08-06

### Corregido

- Editar un movimiento en cuotas ya no falla al abrir el diálogo (`currentEditId` indefinido).
- Editar un gasto o ingreso de una sola vez actualiza la serie completa, no solo un override del mes.
- Al reabrir Editar, el formulario muestra los datos del mes (ocurrencia) cuando hay un ajuste materializado.
- Los movimientos pagos de una serie actualizada con “toda la serie” refrescan nombre e importes previstos sin perder el valor real cobrado/pagado.

### Mejorado

- Categoría y persona en el diálogo de movimiento pasan a selectores nativos (más fiables en WebView2).
- Selector de mes con icono de calendario para saltar a mes/año sin avanzar de a uno.

## 3.2.0 — 2026-08-02

### Añadido

- Persistencia SQLite normalizada, versionada y transaccional.
- Ocurrencias mensuales materializadas con importe previsto, importe real y fecha efectiva.
- Edición y eliminación de recurrencias para este mes, desde este mes o toda la serie.
- Cierre y reapertura controlada de meses.
- Presupuestos mensuales por categoría y comparación con el mes anterior.
- Progreso, cuota actual y saldo restante de compras en cuotas.
- Estados vencido, vence hoy y próximo a vencer.
- Administración de categorías y exportación CSV protegida contra fórmulas.
- Mes de origen explícito para el saldo inicial.
- Instalador y portable estables con generación automática de SHA-256.

### Corregido

- Los pagos reales distintos de lo previsto ya no producen pendientes negativos.
- Los campos ocultos de cuotas ya no bloquean la edición de movimientos mensuales.
- Editar o eliminar una recurrencia conserva los meses pagados o cerrados.
- El saldo inicial deja de aplicarse nuevamente al cambiar el inicio de la proyección.

### Validado

- Migración realista desde una copia V3.1 con importes decimales y cuotas.
- Rollback completo cuando falla una escritura SQLite.
- Persistencia de ocurrencias históricas aun cuando la serie original ya no existe.
- Flujos de alta, pago real, cierre, reapertura, edición futura, presupuestos y responsive.
- 20 pruebas de lógica y 5 pruebas nativas de repositorio.

## 3.1.0 — 2026-08-01

### Añadido

- Resumen mensual de valores cobrados, pagados, flujo realizado y pendientes.
- Pruebas automatizadas para cuotas, recurrencias, orden, estados y proyección.
- Formato de respaldo con metadatos y compatibilidad con copias anteriores.
- Vista previa y confirmación antes de importar.
- Copia automática previa a cada importación.
- Confirmación y opción de deshacer al eliminar movimientos.
- Iconos PWA de 192 px y formato maskable.
- README con ejecución, pruebas, estructura y publicación.
- Aplicación nativa de Windows basada en Tauri y WebView2.
- Instalador NSIS por usuario y ejecutable portable x64.
- Recursos web embebidos, sin servidor local en la versión nativa.
- Sumas SHA-256 para verificar los artefactos de distribución.

### Corregido

- El logotipo ahora vuelve correctamente al inicio.
- Los movimientos mensuales no aceptan un final anterior al inicio.
- Los estados sin movimientos dejan de mostrarse como meses en equilibrio.
- Los saldos negativos se presentan como faltantes, no como dinero libre.
- El icono de búsqueda deja de mostrarse como un signo de pregunta.
- Los importes largos se adaptan mejor en pantallas estrechas.

### Mejorado

- Manejo de errores al guardar en el dispositivo.
- Estado accesible de la navegación activa.
- Foco visible del selector de tipo de movimiento.
- Semántica accesible de gráficos y barras.
- Estrategia offline limitada a recursos propios y navegaciones.
- Caché actualizado a `ilara-static-v5`.

