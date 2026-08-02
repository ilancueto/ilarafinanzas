# Ilara — Finanzas del hogar

Ilara es una aplicación local de escritorio para organizar ingresos, gastos, cuotas y proyecciones mensuales del hogar. No requiere cuenta ni conexión a Internet para funcionar.

## Estado de las versiones

- 3.1.0: entrega estable instalada y preservada en release/.
- 3.2.0-alpha.1: primera base técnica de escritorio.
- 3.2.0-alpha.2: persistencia SQLite normalizada y transaccional.
- 3.2.0: entrega estable actual.

Los ejecutables V3.1 se conservan como ruta de recuperación.

## Aplicación instalada

El instalador estable actual está en release/Ilara-Finanzas-3.2.0-Windows-x64-Setup.exe. La aplicación se instala para el usuario actual y no necesita Node.js, Rust ni un servidor local para ejecutarse.

También se incluye release/Ilara-Finanzas-3.2.0-Windows-x64-Portable.exe para abrir la aplicación sin instalarla.

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

Verificar el proyecto completo:

~~~powershell
npm run verify
~~~

Compilar y preparar instalador, portable y hashes:

~~~powershell
npm run release:build
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
- PLAN_V3.2.md: alcance, fases y aceptación de la versión entregada.
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

La migración desde una copia V3.1 realista está cubierta por una prueba de interfaz y por pruebas transaccionales del repositorio. Aun así, se recomienda exportar una copia JSON desde V3.1 antes de actualizar.

## Publicación

Cada versión debe actualizar coordinadamente la versión del frontend, package.json, Cargo y Tauri. `npm run release:build` ejecuta las verificaciones, compila el release y prepara artefactos con SHA-256 sin eliminar las versiones anteriores.
