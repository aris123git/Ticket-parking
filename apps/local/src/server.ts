import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { seedIfNeeded } from "./seed.js";
import { startSyncLoop, stopSyncLoop } from "./sync.js";

export type StartedServer = {
  port: number;
  host: string;
  url: string;
  close: () => Promise<void>;
};

function appRoot(): string {
  if (process.env.PARKFLOW_APP_ROOT) return path.resolve(process.env.PARKFLOW_APP_ROOT);
  return process.cwd();
}

export function startLocalServer(options?: { port?: number; host?: string }): Promise<StartedServer> {
  seedIfNeeded();
  const app = createApp();
  const dist = path.resolve(appRoot(), "client/dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  const port = Number(options?.port ?? process.env.LOCAL_PORT ?? 3100);
  const host = options?.host ?? process.env.LOCAL_HOST ?? "127.0.0.1";

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      startSyncLoop();
      const url = `http://${host}:${port}`;
      console.log(`ParkFlow Caisse ${url}`);
      resolve({
        port,
        host,
        url,
        close: () =>
          new Promise((res, rej) => {
            stopSyncLoop();
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on("error", reject);
  });
}
