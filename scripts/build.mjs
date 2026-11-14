import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// Bundle everything (including the Wox SDK and axios) into one self-contained
// CJS file: an installed .wox plugin has no node_modules directory.
await build({
  entryPoints: [path.join(root, "src/index.ts")],
  outfile: path.join(out, "index.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: false,
  minify: false,
  logLevel: "info",
  external: [],
});

await cp(path.join(root, "plugin.json"), path.join(out, "plugin.json"));
console.log("built dist/index.js + dist/plugin.json");
