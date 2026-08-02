import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.ILARA_PORT ?? "8765", 10);
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const ROOT_PREFIX = ROOT.endsWith(sep) ? ROOT : `${ROOT}${sep}`;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  try {
    const requestUrl = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = resolve(ROOT, relativePath);

    if (filePath !== ROOT && !filePath.startsWith(ROOT_PREFIX)) {
      sendText(response, 403, "Acceso denegado");
      return;
    }

    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) {
      sendText(response, 404, "Archivo no encontrado");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": body.length,
      "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    const statusCode = error?.code === "ENOENT" ? 404 : 500;
    sendText(response, statusCode, statusCode === 404 ? "Archivo no encontrado" : "Error interno");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`El puerto ${PORT} ya está ocupado. Probá cerrar otro servidor de Ilara.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`Ilara está disponible en http://${HOST}:${PORT}/`);
  console.log("Mantené esta ventana abierta. Presioná Ctrl+C para detener el servidor.");
});
