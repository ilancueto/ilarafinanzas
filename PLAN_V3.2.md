# Ilara V3.2 — Plan de entrega

Estado: en desarrollo  
Inicio: 2026-08-02  
Enfoque: aplicación de escritorio local, integridad histórica y persistencia nativa

## 1. Objetivo

Ilara V3.2 será exclusivamente una aplicación de escritorio para Windows. Deja de publicarse y mantenerse como PWA o aplicación web independiente, aunque Tauri continúe renderizando recursos HTML, CSS y TypeScript incrustados dentro del ejecutable.

La versión debe mejorar la confiabilidad para uso cotidiano en una sola computadora y preparar un modelo de datos que pueda evolucionar hacia sincronización en V4, sin implementar todavía cuentas, nube ni acceso móvil.

## 2. Alcance comprometido

### Plataforma y datos

- Flujo de desarrollo y publicación exclusivamente Tauri.
- Build del frontend con Vite y migración progresiva a TypeScript.
- SQLite como almacenamiento principal de la aplicación instalada.
- Migración automática y recuperable desde `localStorage` V3.1.
- Migraciones versionadas de base de datos.
- Exportación e importación JSON independientes del almacenamiento interno.
- Copia de seguridad previa a migraciones o importaciones destructivas.

### Integridad financiera

- Importes validados y representados internamente en centavos enteros.
- Edición y eliminación de recurrencias con alcance explícito.
- Preservación de meses históricos pagados o cerrados.
- Ocurrencias con importe previsto, importe real, estado y fecha efectiva.
- Limpieza de estados huérfanos y validación estricta de IDs y respaldos.
- Saldo inicial asociado explícitamente al inicio de una proyección.

### Producto

- Cierre y reapertura controlada de meses.
- Presupuestos mensuales por categoría.
- Comparación con meses anteriores y tendencias básicas.
- Progreso y saldo restante de cuotas.
- Estados de vencimiento: vencido, vence hoy y próximo.
- Categorías administrables.
- Exportación CSV.

### Calidad

- Persistencia transaccional: no comunicar éxito antes de confirmar escritura.
- Pruebas de migración, persistencia, recurrencias, importación y recuperación.
- Pruebas de flujos principales de la interfaz instalada.
- CSP restrictiva para la ventana Tauri.
- Proceso reproducible de versión, build, artefactos y hashes.

## 3. Fuera de alcance

- Sincronización entre dispositivos.
- Supabase u otro backend remoto.
- Cuentas de usuario.
- Aplicación web móvil.
- Cuentas bancarias, tarjetas y transferencias.
- Multimoneda y cotizaciones.
- Colaboración entre integrantes del hogar.
- Actualización automática pública.

Estos puntos se reservan para V4.

## 4. Fases

### Fase A — Línea base de escritorio

1. Inicializar Git y preservar la entrega V3.1.
2. Adoptar Vite y TypeScript sin rediseñar la interfaz.
3. Retirar servidor local, service worker y manifest del flujo de build.
4. Mantener los instaladores V3.1 existentes sin sobrescribirlos.

### Fase B — SQLite y migración

1. Definir esquema y migraciones.
2. Implementar repositorio local transaccional.
3. Detectar datos V3.1 en el origen nativo.
4. Exportar una copia previa y migrar una sola vez.
5. Verificar equivalencia de personas, movimientos, estados y ajustes.
6. Conservar una ruta de recuperación.

### Fase C — Modelo financiero V3.2

1. Separar series recurrentes de ocurrencias mensuales.
2. Registrar valores previstos y reales.
3. Implementar alcance de edición y eliminación.
4. Incorporar cierre mensual.
5. Añadir presupuestos, tendencias, cuotas y vencimientos.

### Fase D — Endurecimiento y publicación

1. Completar pruebas unitarias, de integración y de interfaz.
2. Validar actualización real desde V3.1.
3. Compilar instalador y portable V3.2.
4. Generar hashes automáticamente.
5. Probar persistencia entre reaperturas y recuperación de respaldo.

## 5. Criterios de aceptación

- Una instalación V3.1 con datos puede actualizarse sin pérdida ni duplicación.
- La migración fallida deja intacto el estado anterior y ofrece recuperación.
- Ninguna acción muestra éxito si la escritura persistente falló.
- Editar una recurrencia no altera silenciosamente meses históricos.
- Los meses cerrados conservan sus valores previstos y reales.
- Todas las operaciones monetarias conservan exactitud de centavos.
- La aplicación funciona sin Internet y no registra service worker.
- Pruebas, comprobación estática, `cargo check` y build release finalizan correctamente.
- Los artefactos V3.1 permanecen disponibles hasta validar V3.2.

## 6. Decisiones que se preservan

