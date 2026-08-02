# Ilara — Finanzas del hogar

Ilara es una aplicación local para organizar ingresos, gastos, cuotas y proyecciones mensuales del hogar. No requiere cuenta y guarda la información en el dispositivo.

## Aplicación nativa para Windows

El instalador recomendado está en `release/Ilara-Finanzas-3.1.0-Windows-x64-Setup.exe`. Instala Ilara para el usuario actual, crea su entrada en Windows y no necesita Node.js, Rust ni un servidor local para funcionar.

También se incluye `release/Ilara-Finanzas-3.1.0-Windows-x64-Portable.exe`, que abre la aplicación sin instalación. Windows 10 y Windows 11 normalmente ya incluyen el runtime WebView2 requerido.

La aplicación instalada puede desinstalarse desde Configuración → Aplicaciones → Aplicaciones instaladas.

### Pasar datos desde la versión web

Windows considera la versión web y la aplicación nativa como ubicaciones diferentes. Para migrar datos:

1. Abrí la versión web y usá `Ajustes → Exportar copia`.
2. Abrí la aplicación nativa y usá `Ajustes → Importar copia`.
3. Revisá el resumen y confirmá la importación.

## Ejecutar la versión web

La aplicación utiliza módulos JavaScript. No abras `index.html` directamente con doble clic, porque los navegadores bloquean esas importaciones bajo `file://`.

En Windows, hacé doble clic en `INICIAR_ILARA.cmd`. Se abrirá el navegador en `http://127.0.0.1:8765/`; mantené la ventana del servidor abierta mientras uses la aplicación.

También podés iniciarla desde PowerShell:

```powershell
npm start
```

Después, abrí `http://127.0.0.1:8765/`. El servidor usa únicamente Node.js y no instala dependencias.

Para detenerlo, presioná `Ctrl+C` en la terminal o cerrá su ventana. Los datos siguen guardándose localmente en el navegador.

## Verificación

Requisitos: Node.js 20 o posterior.

Para comprobar el frontend:

```powershell
npm test
npm run check
```

Para comprobar o compilar la aplicación nativa, con Rust y Visual Studio Build Tools instalados:

```powershell
npm run native:check
npm run native:build
```

## Estructura

- `src-tauri/`: configuración y entrada nativa de Tauri.
- `scripts/build-web.js`: prepara los recursos web que se incrustan en la aplicación.
- `release/`: instalador, ejecutable portable y sumas SHA-256 de la entrega.
- `index.html`: estructura de las vistas y diálogos.
- `styles.css`: diseño responsive y estados visuales.
- `app.js`: estado, persistencia, control de interfaz e importación/exportación.
- `finance-core.js`: lógica financiera pura y reutilizable.
- `tests/`: pruebas automatizadas del motor financiero.
- `manifest.json` y `service-worker.js`: instalación y funcionamiento offline.
- `PLAN_V3.1.md`: alcance y criterios de la entrega 3.1.

## Datos y respaldos

- Los datos se guardan bajo la clave `ilara-finanzas-v3`.
- La versión de la aplicación es independiente de la versión del formato interno.
- Las copias V3.1 incluyen metadatos de formato, versión y fecha.
- La importación sigue aceptando respaldos antiguos V1, V2 y V3.
- Antes de importar se descarga una copia automática del estado actual.

La importación reemplaza los datos solamente después de mostrar una vista previa y recibir confirmación.

## Publicación de una nueva versión

1. Ejecutar pruebas y comprobación de sintaxis.
2. Probar los anchos 320, 375, 560, 820, 1120 px y escritorio.
3. Verificar exportación, importación, deshacer y recuperación.
4. Comprobar una primera carga online y una reapertura offline.
5. Actualizar `APP_VERSION`, `package.json`, `CHANGELOG.md` y el nombre de caché.

