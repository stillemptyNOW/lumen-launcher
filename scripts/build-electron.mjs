import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(root, "src/main/index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(root, "dist-electron/main.js"),
  external: ["electron", "keytar"],
  sourcemap: false,
  legalComments: "none",
});

await build({
  entryPoints: [path.join(root, "src/main/preload.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(root, "dist-electron/preload.js"),
  external: ["electron"],
  sourcemap: false,
  legalComments: "none",
});

console.log("electron main/preload bundled");
