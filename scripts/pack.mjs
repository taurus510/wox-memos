import { zipSync } from "fflate";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const files = ["index.js", "plugin.json"];

const entries = {};
for (const name of files) {
  entries[name] = await readFile(path.join(dist, name));
}

const zipped = zipSync(entries, { level: 6 });
const out = path.join(root, "wox.plugin.memos.wox");
await writeFile(out, zipped);
console.log(`packaged ${out} (${zipped.length} bytes)`);
