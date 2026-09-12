import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

function fromImportMeta(): string | null {
  try {
    const url = import.meta.url;
    if (typeof url === "string" && url.startsWith("file:")) {
      return path.dirname(fileURLToPath(url));
    }
  } catch {
    /* bundled cjs */
  }
  return null;
}

function appRoot(): string {
  if (process.env.PARKFLOW_APP_ROOT) return path.resolve(process.env.PARKFLOW_APP_ROOT);
  const here = fromImportMeta();
  if (here) return path.resolve(here, "..");
  return process.cwd();
}

function schemaFile(): string {
  if (process.env.LOCAL_SCHEMA_PATH && fs.existsSync(process.env.LOCAL_SCHEMA_PATH)) {
    return process.env.LOCAL_SCHEMA_PATH;
  }
  const root = appRoot();
  const here = fromImportMeta();
  const candidates = [
    here ? path.join(here, "schema.sql") : "",
    path.join(root, "src", "schema.sql"),
    path.join(root, "dist-server", "schema.sql"),
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Fichier schema.sql introuvable");
  return found;
}

export const DATA_DIR = process.env.LOCAL_DATA_DIR
  ? path.resolve(process.env.LOCAL_DATA_DIR)
  : path.join(appRoot(), "data");

export const DB_PATH = path.join(DATA_DIR, "parking-local.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(fs.readFileSync(schemaFile(), "utf8"));
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function openMemoryDb(): Database.Database {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(schemaFile(), "utf8"));
  return db;
}
