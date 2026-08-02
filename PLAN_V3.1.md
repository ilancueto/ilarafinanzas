# Ilara V3.1 — Plan de entrega

Estado: implementada y validada  
Fecha: 2026-08-01  
Enfoque: confianza, seguridad de datos y claridad mensual

## 1. Objetivo

La V3.1 debe convertir el MVP actual en una aplicación confiable para uso cotidiano sin ampliar todavía el modelo financiero de forma sustancial.

La versión se considera exitosa cuando:

- ninguna acción destructiva puede provocar una pérdida silenciosa de datos;
- los cálculos de cuotas, recurrencias, estados y proyección tienen pruebas automáticas;
- la navegación funciona de forma consistente desde todos los accesos;
- los importes y controles se leen correctamente desde 320 px hasta escritorio;
- la aplicación conserva su funcionamiento local y offline;
- el usuario puede distinguir claramente lo previsto de lo efectivamente pagado o cobrado.

## 2. Alcance de la V3.1

### Incluido

1. Corrección de errores funcionales detectados en la revisión.
2. Protección frente a borrado e importación accidental.
3. Validación y versionado explícito de respaldos.
4. Pruebas automatizadas para la lógica financiera.
5. Ajustes responsive, accesibilidad y textos de estado.
6. Mejora del manifest y del comportamiento offline.
7. Resumen mensual de valores reales frente a previstos.
8. Documentación mínima para mantener y publicar el proyecto.

### Fuera de alcance

- sincronización bancaria o conexión con entidades financieras;
- cuentas de usuario, nube o sincronización entre dispositivos;
- presupuestos por categoría;
- cuentas, tarjetas, cierres y transferencias;
- manejo multimoneda o cotizaciones;
- objetivos de ahorro y notificaciones.

Estos puntos quedan como candidatos para V3.2 o V4.0. Incluirlos ahora obligaría a cambiar el modelo de datos y dificultaría estabilizar la base existente.

## 3. Prioridades

| ID | Prioridad | Entrega | Tamaño |
|---|---|---|---|
| V31-01 | P0 | Corregir el enlace del logotipo y unificar la ruta de inicio en `#dashboard` | S |
| V31-02 | P0 | Confirmación y opción de deshacer al eliminar movimientos | M |
| V31-03 | P0 | Importación segura: validar, previsualizar, confirmar y generar copia previa | L |
| V31-04 | P0 | Manejar fallos de `localStorage` sin romper el renderizado | M |
| V31-05 | P0 | Extraer y probar la lógica de cuotas, recurrencias y proyección | L |
| V31-06 | P1 | Validar que el mes final no sea anterior al mes inicial | S |
| V31-07 | P1 | Mostrar resumen “real vs. previsto” usando estados pagado/cobrado | M |
| V31-08 | P1 | Corregir importes partidos y densidad visual en móvil | M |
| V31-09 | P1 | Mejorar navegación por teclado, foco y estado accesible de la vista activa | M |
| V31-10 | P1 | Hacer accesibles o decorativos los gráficos según corresponda | M |
| V31-11 | P1 | Afinar service worker, iconos PWA y estrategia de caché | M |
| V31-12 | P2 | Corregir icono del buscador, mensajes y estados vacíos | S |
| V31-13 | P2 | Crear README, comandos de verificación y notas de versión | S |

P0 bloquea la publicación. P1 forma parte del alcance comprometido. P2 puede moverse si aparece un defecto crítico durante la validación.

## 4. Fases de ejecución

### Fase 1 — Base verificable

- Definir `APP_VERSION = "3.1.0"` separado de la versión del formato de datos.
- Mantener compatibilidad con los respaldos y estados actuales.
- Extraer solamente la lógica financiera pura a un módulo independiente.
- Incorporar pruebas con el runner nativo de Node para evitar dependencias innecesarias.
- Documentar los resultados actuales como pruebas de caracterización antes de cambiar cálculos.

Salida de la fase:

- comando único para ejecutar pruebas;
- cálculos críticos probados;
- aplicación funcionando igual que antes de la extracción.

### Fase 2 — Errores y validaciones

- Cambiar el enlace de marca a la vista real de inicio.
- Validar rangos de meses en movimientos recurrentes.
- Mostrar errores dentro del formulario sin cerrar el diálogo.
- Cambiar “libre” por “faltante” cuando el resultado sea negativo.
- Mostrar “Sin datos” en lugar de “Mes en equilibrio” cuando no existan movimientos.
- Reemplazar el `?` del buscador por un icono consistente.

Salida de la fase:

- navegación coherente;
- ningún movimiento puede guardarse con un rango temporal imposible;
- mensajes financieros sin contradicciones.

### Fase 3 — Seguridad de datos

- Encapsular lectura y escritura de almacenamiento con manejo de errores.
- Informar si los datos no pudieron guardarse.
- Solicitar confirmación antes de eliminar.
- Conservar temporalmente el movimiento eliminado para permitir “Deshacer”.
- Definir un sobre de respaldo con:
  - identificador de formato;
  - versión del formato;
  - versión de la aplicación;
  - fecha de exportación;
  - datos normalizados.
- Seguir aceptando los respaldos V1, V2 y V3 existentes.
- Rechazar archivos excesivamente grandes, corruptos o incompatibles.
- Mostrar cantidad de personas, movimientos y rango de meses antes de importar.
- Generar una copia automática del estado actual antes de reemplazarlo.

Salida de la fase:

- exportar e importar produce el mismo estado;
- una importación fallida no modifica datos existentes;
- una importación correcta puede revertirse con la copia previa.

### Fase 4 — Claridad del mes y experiencia móvil

- Añadir un resumen “Real del mes” con:
  - ingresos cobrados;
  - gastos pagados;
  - flujo realizado;
  - importes todavía pendientes.
- Mantener separado el resultado real del saldo previsto.
- Ajustar las tarjetas para que importes ARS largos no se corten de forma ilegible.
- Revisar 320, 375, 560, 820, 1120 px y escritorio amplio.
- Verificar diálogo, navegación inferior, botón flotante y listas con teclado.
- Añadir `aria-current="page"` a la vista activa.
- Dar una alternativa accesible a gráficos y barras o marcarlos como decorativos cuando la información ya esté expresada en texto.

Salida de la fase:

- no hay desplazamiento horizontal accidental;
- todos los importes principales son legibles;
- previsto y realizado no se confunden;
- la navegación activa se comunica visualmente y a tecnologías de asistencia.

### Fase 5 — PWA, documentación y publicación

- Limitar el fallback de `index.html` a solicitudes de navegación.
- Evitar almacenar respuestas fallidas en caché.
- Añadir iconos de 192 y 512 px, incluido un recurso `maskable`.
- Actualizar el nombre de caché al publicar la versión.
- Comprobar carga inicial online y reapertura offline.
- Crear README con ejecución local, estructura, respaldo y pruebas.
- Añadir `CHANGELOG.md` con los cambios de V3.1.
- Ejecutar la matriz completa de aceptación.

Salida de la fase:

- instalación PWA válida;
- segundo inicio disponible sin conexión;
- proceso de mantenimiento y verificación documentado.

## 5. Matriz mínima de pruebas

### Lógica financiera

- movimiento único visible solamente en el mes indicado;
- movimiento mensual sin final y con final inclusivo;
- rechazo de un final anterior al inicio;
- cuotas que dividen exactamente;
- cuotas con centavos y reparto del resto sin perder dinero;
- última cuota y desaparición en el mes siguiente;
- orden por estado, vencimiento y nombre;
- saldo previsto y acumulado con saldo inicial positivo y negativo;
- estado pagado/cobrado independiente por mes;
- edición y eliminación sin estados huérfanos visibles.

### Persistencia y respaldo

- inicio sin datos;
- carga de estado V3 actual;
- migración de respaldos V1 y V2;
- JSON inválido;
- archivo con estructura desconocida;
- archivo sobredimensionado;
- error simulado de almacenamiento;
- exportación e importación de ida y vuelta;
- restauración de la copia previa.

### Interfaz

- logotipo, barra lateral y navegación inferior llevan a la misma vista;
- altas, edición, borrado, pago y cobro;
- filtros combinados y búsqueda;
- diálogo usable con teclado y Escape;
- foco visible en todos los controles;
- importes largos en los anchos definidos;
- ausencia de errores o advertencias en consola.

### PWA

- manifest e iconos disponibles;
- precache completo;
- actualización de caché;
- navegación offline;
- un recurso inexistente no recibe HTML salvo que sea una navegación.

## 6. Criterios de aceptación de la versión

La V3.1 está lista para publicar únicamente si:

- todos los elementos P0 y P1 están cerrados;
- todas las pruebas automatizadas pasan;
- no quedan errores conocidos de severidad alta;
- importación, eliminación y almacenamiento tienen recuperación o aviso explícito;
- el flujo completo se valida manualmente en escritorio y móvil;
- no aparecen errores en consola;
- la reapertura offline funciona después de una primera carga;
- README y CHANGELOG reflejan el comportamiento entregado.

## 7. Orden recomendado de implementación

1. V31-05 — base de pruebas y extracción mínima de lógica.
2. V31-01 y V31-06 — navegación y validación temporal.
3. V31-04 — almacenamiento tolerante a errores.
4. V31-02 y V31-03 — borrado e importación segura.
5. V31-07 — resumen real frente a previsto.
6. V31-08, V31-09, V31-10 y V31-12 — móvil, accesibilidad y textos.
7. V31-11 y V31-13 — PWA, documentación y cierre.

## 8. Decisiones de producto adoptadas

- V3.1 prioriza confiabilidad sobre cantidad de funciones.
- La aplicación continúa siendo local y sin cuenta.
- La versión de la aplicación y la versión del formato de datos se gestionan por separado.
- El resumen real se calcula con la información ya disponible; no incorpora cuentas bancarias.
- Toda ampliación que requiera cuentas, tarjetas o presupuestos se planificará después de estabilizar V3.1.

