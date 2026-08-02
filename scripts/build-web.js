import { copyFile, mkdir, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const outputDirectory = join(projectRoot, "dist");
const webAssets = [
  "app.js",
  "finance-core.js",
  "icon-192.png",
  "icon-maskable-512.png",
  "icon.svg",
  "index.html",
  "logo_ilara.png",
  "manifest.json",
  "service-worker.js",
  "styles.css",
];

if (basename(outputDirectory) !== "dist" || dirname(outputDirectory) !== projectRoot) {
  throw new Error("La carpeta de salida no es segura.");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const asset of webAssets) {
  await copyFile(join(projectRoot, asset), join(outputDirectory, asset));
}

console.log(`Frontend preparado en ${outputDirectory}`);
