# Contexto de entrega — Ilara Finanzas

Fecha del handoff: 2026-08-02  
Versión actual: 3.1.0  
Estado: implementada, compilada, instalada y validada  
Workspace: `C:\Users\ilaan\Escritorio\Finanzas personales`

## 1. Resumen ejecutivo

Ilara es una aplicación local para organizar finanzas personales y del hogar. Permite registrar ingresos y gastos únicos, mensuales o en cuotas; asignarlos a personas y categorías; marcar cada ocurrencia mensual como cobrada o pagada; consultar el estado previsto y real del mes; y proyectar saldos futuros.

El proyecto comenzó como una aplicación web estática basada en HTML, CSS y JavaScript. Durante este trabajo se completó la V3.1, se reforzó la seguridad de los datos y finalmente se convirtió en una aplicación nativa de Windows mediante Tauri 2.

La versión nativa está instalada para el usuario actual, aparece como `Ilara Finanzas` en el menú Inicio y no necesita servidor local, terminal ni Node.js para ejecutarse.

## 2. Objetivo expresado por el usuario

El usuario pidió:

1. Revisar el proyecto y detectar márgenes de mejora.
2. Planificar e iniciar la V3.1.
3. Implementar todo el alcance de la V3.1.
4. Resolver la carga local de módulos JavaScript.
5. Convertir la aplicación en una experiencia nativa que no dependiera de un launcher o servidor local.

Todos esos puntos quedaron atendidos.

## 3. Funcionalidad actual

### Gestión financiera

- Ingresos y gastos.
- Movimientos únicos, mensuales con final opcional y en cuotas.
- Distribución exacta de centavos entre cuotas.
- Personas responsables y categorías.
- Día de vencimiento y notas.
- Estado pendiente/pagado o pendiente/cobrado por ocurrencia mensual.
- Búsqueda y filtros de movimientos.
- Edición y eliminación con confirmación.
- Acción de deshacer después de eliminar.

### Dashboard

- Ingresos y gastos previstos.
- Disponible estimado.
- Pendientes del mes.
- Valores efectivamente cobrados y pagados.
- Flujo real y balance previsto.
- Estado del mes y tasa de compromiso.
- Distribución por categorías.
- Próximos movimientos.

### Proyección

- Proyección configurable a 6, 12, 18 o 24 meses.
- Saldo inicial configurable.
- Acumulación mensual prevista.
- Gráfico y lista accesibles.

### Seguridad de los datos

- Persistencia local con manejo de errores.
- Exportación de respaldos JSON.
- Formato de respaldo identificado y versionado.
- Compatibilidad con estados antiguos V1, V2 y V3.
- Límite de importación de 5 MB.
- Vista previa y confirmación antes de importar.
- Respaldo automático antes de reemplazar datos.
- Acción para restaurar el estado previo a una importación.

## 4. Arquitectura

```text
index.html + styles.css
          │
          ├── app.js                 UI, estado, persistencia e importación/exportación
          │       │
          │       └── finance-core.js lógica financiera pura
          │
          ├── service-worker.js      caché y funcionamiento offline de la versión web
          └── manifest.json          instalación PWA

scripts/build-web.js
          │
          └── dist/                  frontend limpio para empaquetar
                    │
                    └── src-tauri/   shell nativo Tauri/WebView2
                              │
                              └── instalador NSIS + ejecutable portable
```

La aplicación no tiene backend ni base de datos remota. Todo se ejecuta y se guarda en el dispositivo.

## 5. Estado y formato de datos

La clave principal de `localStorage` es:

```text
ilara-finanzas-v3
```

El estado contiene, conceptualmente:

```js
{
  version: 3,
  activeMonth: "YYYY-MM",
  activeView: "dashboard" | "movements" | "projection" | "settings",
  settings: {
    currency: "ARS",
    locale: "es-AR",
    openingBalance: 0,
    projectionMonths: 12
  },
  people: [],
  transactions: [],
  occurrenceStatus: {}
}
```

Constantes relevantes en `app.js`:

- `APP_VERSION = "3.1.0"`
- `STORAGE_KEY = "ilara-finanzas-v3"`
- `BACKUP_FORMAT = "ilara-finanzas-backup"`
- `BACKUP_VERSION = 1`
- `MAX_IMPORT_BYTES = 5 * 1024 * 1024`

Importante: la versión web y la versión nativa tienen orígenes de almacenamiento diferentes. Los datos no pasan automáticamente de una a otra. Para migrarlos se debe exportar una copia desde `Ajustes` en la versión de origen e importarla en la otra.

## 6. Archivos importantes

- `app.js`: estado, renderizado, eventos, almacenamiento y respaldos.
- `finance-core.js`: cálculos puros de meses, cuotas, ocurrencias, totales y proyección.
- `tests/finance-core.test.js`: pruebas unitarias del motor financiero.
- `index.html`: estructura de vistas y diálogos.
- `styles.css`: diseño responsive y accesibilidad visual.
- `manifest.json` y `service-worker.js`: PWA y modo offline web.
- `server.js`: servidor HTTP local sin dependencias para la versión web.
- `INICIAR_ILARA.cmd`: iniciador opcional de la versión web.
- `scripts/build-web.js`: genera `dist/` con los recursos que Tauri debe incrustar.
- `src-tauri/tauri.conf.json`: ventana, identificador y configuración del bundle NSIS.
- `src-tauri/Cargo.toml`: paquete Rust/Tauri.
- `src-tauri/src/lib.rs` y `src-tauri/src/main.rs`: entrada nativa mínima.
- `README.md`: uso, compilación y migración de datos.
- `CHANGELOG.md`: cambios de la V3.1.
- `PLAN_V3.1.md`: alcance y criterios de aceptación originales.
- `release/`: artefactos finales para Windows.

## 7. Aplicación nativa de Windows

Tecnología: Tauri 2 + Rust + Microsoft Edge WebView2.  
Identificador: `com.ilara.finanzas`  
Producto: `Ilara Finanzas`  
Ventana inicial: 1180 × 800 px  
Ventana mínima: 320 × 600 px  
Bundle: instalador NSIS x64 por usuario.

La instalación comprobada quedó en:

```text
C:\Users\ilaan\AppData\Local\Ilara Finanzas
```

Windows registró la aplicación como `Ilara Finanzas 3.1.0` y creó este acceso en el menú Inicio:

```text
C:\Users\ilaan\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Ilara Finanzas.lnk
```

### Artefactos entregables

```text
release\Ilara-Finanzas-3.1.0-Windows-x64-Setup.exe
release\Ilara-Finanzas-3.1.0-Windows-x64-Portable.exe
release\SHA256SUMS.txt
```

Tamaños aproximados:

- Instalador: 1,9 MB.
- Portable: 8,6 MB.

SHA-256:

```text
697DFDFFFF4220B284A640869C59AA10EE035E84ECC2D4AB1E8BCED39E597453  Ilara-Finanzas-3.1.0-Windows-x64-Setup.exe
BFC69F82D772C7317855714CBCCACD16703FE84B9B70236E0BF7897C50BABF16  Ilara-Finanzas-3.1.0-Windows-x64-Portable.exe
```

El instalador no está firmado digitalmente. Funciona localmente, pero Windows SmartScreen puede advertir al descargarlo desde Internet en otra computadora. Para distribución pública conviene incorporar un certificado de firma de código.

## 8. Herramientas instaladas en la máquina de desarrollo

- Node.js 24.13.1.
- npm 11.8.0.
- Rust 1.97.1 mediante Rustup.
- Cargo 1.97.1.
- Visual Studio Build Tools 2022 con el workload C++.
- Tauri CLI 2.11.0 como dependencia de desarrollo.
- WebView2 150.0.4078.105 detectado durante la compilación.

Estas herramientas son necesarias para desarrollar y recompilar, no para usar la aplicación ya instalada.

## 9. Comandos habituales

Desde la raíz del proyecto:

```powershell
# Pruebas unitarias
npm test

# Sintaxis JavaScript
npm run check

# Preparar el frontend en dist/
npm run web:build

# Ejecutar la versión web en http://127.0.0.1:8765/
npm start

# Comprobar Rust/Tauri
npm run native:check

# Ejecutar Tauri en desarrollo
npm run native:dev

# Compilar el ejecutable y el instalador NSIS
npm run native:build
```

Si una terminal antigua no encuentra `cargo`, abrir una nueva terminal para que tome la actualización de `PATH` realizada por Rustup.

## 10. Verificaciones realizadas

- 8 de 8 pruebas unitarias superadas.
- Comprobación sintáctica de todos los módulos JavaScript superada.
- `cargo check` superado.
- Build release de Tauri superado.
- Instalador NSIS generado correctamente.
- Instalación silenciosa completada con código 0.
- Registro de desinstalación de Windows confirmado.
- Acceso del menú Inicio confirmado.
- Ejecutable instalado abierto y mantenido en ejecución.
- Título de ventana `Ilara Finanzas` confirmado.
- Dashboard completo inspeccionado visualmente dentro de la ventana nativa.
- Hashes de los artefactos de `release/` comprobados.
- En la etapa web también se probaron los anchos 320, 375, 560, 820, 1120 y 1440 px, incluyendo la corrección del desbordamiento a 320 px.
- Recarga offline de la PWA comprobada previamente sin errores de consola.

## 11. Decisiones importantes que deben preservarse

1. La lógica financiera pura debe seguir en `finance-core.js`; evitar volver a mezclar cálculos con manipulación del DOM.
2. No cambiar `STORAGE_KEY` ni el formato de respaldos sin implementar una migración.
3. Mantener la importación compatible con copias V1, V2 y V3.
4. Mantener confirmación, respaldo automático y recuperación antes de reemplazar datos.
5. No registrar el service worker dentro de Tauri. `app.js` ya detecta `window.__TAURI_INTERNALS__` para evitarlo.
6. `scripts/build-web.js` sólo debe copiar recursos explícitamente enumerados a `dist/`.
7. El diseño debe continuar funcionando desde 320 px.
8. No asumir que existe un repositorio Git: actualmente esta carpeta no contiene `.git` y `git rev-parse` devuelve que no es un worktree.

## 12. Proceso recomendado para una nueva versión

1. Implementar el cambio y actualizar pruebas.
2. Ejecutar `npm test` y `npm run check`.
3. Ejecutar `npm run native:check`.
4. Actualizar la versión de forma coordinada en:
   - `app.js`
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
   - `CHANGELOG.md`
5. Si cambia la PWA, actualizar también el nombre de caché en `service-worker.js`.
6. Ejecutar `npm run native:build`.
7. Copiar los nuevos artefactos a `release/` con nombres estables.
8. Regenerar y verificar `release/SHA256SUMS.txt`.
9. Instalar y abrir el nuevo bundle en una prueba real.
10. Verificar importación/exportación y persistencia entre reaperturas.

## 13. Limitaciones y próximos márgenes de mejora

### Prioridad alta

- Firmar digitalmente el instalador para distribución pública.
- Agregar pruebas automatizadas de interfaz y flujos nativos.
- Crear un proceso de release reproducible que copie artefactos y genere hashes automáticamente.
- Inicializar un repositorio Git antes de continuar con cambios grandes.

### Producto

- Presupuestos por categoría.
- Objetivos de ahorro.
- Comparación entre meses y tendencias.
- Reglas o plantillas de movimientos recurrentes.
- Reportes exportables a CSV/PDF.
- Notificaciones de próximos vencimientos.

### Datos y sincronización

- Actualmente no hay cuentas, nube ni sincronización entre dispositivos.
- Si se agrega sincronización, diseñar primero autenticación, cifrado, resolución de conflictos y migración desde `localStorage`.
- Mantener siempre una ruta de exportación local independiente del servicio remoto.

## 14. Indicación para el próximo asistente

Antes de modificar el proyecto, leer en este orden:

1. `CONTEXTO_HANDOFF_ILARA.md`
2. `README.md`
3. `PLAN_V3.1.md`
4. `CHANGELOG.md`
5. `finance-core.js` y sus pruebas
6. `app.js`
7. `src-tauri/tauri.conf.json`

Después ejecutar:

```powershell
npm test
npm run check
npm run native:check
```

No reemplazar ni borrar los artefactos existentes de `release/` hasta haber generado y validado una compilación nueva.
