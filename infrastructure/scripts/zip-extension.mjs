#!/usr/bin/env node
/**
 * Empaqueta apps/extension/dist en tgs-extension.zip. Reemplazo cross-platform del viejo
 * zip-extension.ps1 (PowerShell, solo Windows) — usa `archiver`, corre igual en Mac/Linux/Windows.
 */
import { createWriteStream, existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const source = path.join(root, "apps/extension/dist");
const target = path.join(root, "apps/extension/tgs-extension.zip");
const storageDir = path.join(root, "storage/extension");
const storageTarget = path.join(storageDir, "tgs-extension.zip");

const EXCLUDE = new Set(["preview.html", "preview.js"]);

if (!existsSync(source)) {
  console.error("Primero ejecute el build de extension (pnpm --filter @tgs/extension build)");
  process.exit(1);
}
if (!existsSync(path.join(source, "manifest.json"))) {
  console.error("dist/ no contiene manifest.json; el build de la extension fallo");
  process.exit(1);
}

if (existsSync(target)) rmSync(target, { force: true });

await new Promise((resolve, reject) => {
  const output = createWriteStream(target);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);
  archive.glob("**/*", {
    cwd: source,
    ignore: [...EXCLUDE],
    dot: true,
  });
  void archive.finalize();
});

mkdirSync(storageDir, { recursive: true });
copyFileSync(target, storageTarget);

console.log(target);
console.log(storageTarget);
