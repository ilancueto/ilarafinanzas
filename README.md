# Ilara — Finanzas del hogar

Ilara es una aplicación local de escritorio para organizar ingresos, gastos, cuotas y proyecciones mensuales del hogar. No requiere cuenta ni conexión a Internet para funcionar.

## Estado de las versiones

- 3.1.0: entrega estable instalada y preservada en release/.
- 3.2.0-alpha.1: primera base técnica de escritorio.
- 3.2.0-alpha.2: persistencia SQLite normalizada y transaccional, en validación.

Los ejecutables V3.1 no deben reemplazarse hasta completar y validar la migración de datos de V3.2.

## Aplicación instalada

El instalador estable actual está en release/Ilara-Finanzas-3.1.0-Windows-x64-Setup.exe. La aplicación se instala para el usuario actual y no necesita Node.js, Rust ni un servidor local para ejecutarse.

El instalador de prueba más reciente está en release/Ilara-Finanzas-3.2.0-alpha.2-Windows-x64-Setup.exe. Es una versión alpha de actualización y todavía no reemplaza a V3.1 como entrega estable.

La V3.2 deja de publicar una PWA o versión web independiente. Tauri continúa incrustando los recursos de interfaz dentro del ejecutable.

## Desarrollo

Requisitos:

- Node.js 20 o posterior.
- Rust estable.
- Visual Studio Build Tools con el workload de C++.
- Microsoft Edge WebView2.

Instalar dependencias:

~~~powershell
npm install
~~~

Ejecutar la aplicación de escritorio en desarrollo:

~~~powershell
npm run native:dev
~~~

Verificar el proyecto:

~~~powershell
npm test
npm run native:test
npm run check
npm run build
npm run native:check
~~~

Compilar el instalador:

~~~powershell
npm run native:build
~~~

## Estructura

- src/: entrada TypeScript del frontend incrustado.
- src-tauri/: configuración, código Rust e instalador Tauri.
- index.html: estructura de las vistas y diálogos.
- styles.css: diseño responsive y estados visuales.
- app.js: interfaz y coordinación del estado durante la migración progresiva.
- state-core.js: normalización monetaria y recuperación de datos anteriores.
- finance-core.js: lógica financiera pura.
- src-tauri/src/repository.rs: repositorio SQLite nativo y transaccional.
- tests/: pruebas automatizadas.
- release/: instaladores y hashes; V3.1 permanece preservada.
- PLAN_V3.2.md: alcance, fases y aceptación de la versión en desarrollo.
- CONTEXTO_HANDOFF_ILARA.md: contexto histórico de la entrega 3.1.

## Datos durante la migración

V3.2 usa SQLite como almacenamiento principal. Ajustes, personas, movimientos y estados mensuales se guardan en tablas separadas. El JSON completo se conserva solamente como copia de recuperación.

La migración:

- no elimina ni modifica el localStorage V3.1;
- evita volver a migrar cuando SQLite ya contiene un estado;
- conserva una copia de emergencia si SQLite falla durante un guardado;
- guarda respaldo y datos normalizados dentro de una única transacción;
- convierte los importes anteriores a centavos enteros;
- elimina estados mensuales inválidos o huérfanos;
- recupera y consolida automáticamente esa copia en el próximo arranque;
- mantiene importación y exportación JSON independientes de SQLite.

Antes de probar la alpha con datos reales se recomienda exportar una copia JSON desde V3.1. La equivalencia completa de una actualización real todavía forma parte de la validación pendiente de V3.2.

## Publicación

Cada versión debe actualizar coordinadamente la versión del frontend, package.json, Cargo y Tauri. Antes de publicar se ejecutan pruebas, comprobación estática, build del frontend, cargo check, build release, verificación de migración y generación de hashes.
