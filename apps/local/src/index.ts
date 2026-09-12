import path from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalServer } from "./server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.PARKFLOW_APP_ROOT ??= path.resolve(here, "..");
process.env.LOCAL_SCHEMA_PATH ??= path.join(here, "schema.sql");

const PORT = Number(process.env.LOCAL_PORT || 3100);
const HOST = process.env.LOCAL_HOST || "127.0.0.1";

startLocalServer({ port: PORT, host: HOST }).catch((err) => {
  console.error(err);
  process.exit(1);
});
