import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.CLOUD_DATA_DIR
  ? path.resolve(process.env.CLOUD_DATA_DIR)
  : path.resolve(__dirname, "../data");
export const DB_PATH = path.join(DATA_DIR, "parking-cloud.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

export function openMemoryDb(): Database.Database {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  return db;
}
