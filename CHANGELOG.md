# Historial de cambios

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

