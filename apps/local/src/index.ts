import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "./app.js";
import { seedIfNeeded } from "./seed.js";
import { startSyncLoop } from "./sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.LOCAL_PORT || 3100);

seedIfNeeded();

const app = createApp();
const dist = path.resolve(__dirname, "../client/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

startSyncLoop();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ParkFlow local http://127.0.0.1:${PORT}`);
});
