import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createCloudApp } from "./app.js";
import { seedCloud } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CLOUD_PORT || 3200);

seedCloud();
const app = createCloudApp();
const dist = path.resolve(__dirname, "../client/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ParkFlow cloud http://127.0.0.1:${PORT}`);
});
