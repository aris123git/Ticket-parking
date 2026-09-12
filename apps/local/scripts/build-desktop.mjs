import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await build({
  absWorkingDir: root,
  entryPoints: ["src/electron-entry.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-server/server.cjs",
  external: ["better-sqlite3", "electron"],
  logLevel: "info",
});

fs.copyFileSync(path.join(root, "src/schema.sql"), path.join(root, "dist-server/schema.sql"));
console.log("Desktop server bundle ready");
