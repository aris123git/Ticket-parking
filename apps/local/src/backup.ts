import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { closeDb, getDataDir, getDb, getDbPath } from "./db.js";
import { writeAudit } from "./audit.js";
import { seedIfNeeded, type AuthUser } from "./seed.js";
import { unzip, zipStore } from "./zip.js";

const SAFE_NAME = /^parkflow-[\w.-]+\.zip$/;

export function backupsDir(): string {
  return path.join(getDataDir(), "backups");
}

function ensureBackupsDir(): string {
  const dir = backupsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function pruneOldBackups(dir: string, keep = 20): void {
  const files = listBackupFiles().sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const extra of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, extra.filename));
    } catch {
      /* ignore */
    }
  }
}

export function listBackupFiles(): { filename: string; size: number; mtimeMs: number }[] {
  const dir = ensureBackupsDir();
  return fs
    .readdirSync(dir)
    .filter((name) => SAFE_NAME.test(name))
    .map((filename) => {
      const stat = fs.statSync(path.join(dir, filename));
      return { filename, size: stat.size, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function createBackup(user?: AuthUser) {
  const dir = ensureBackupsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `parkflow-${stamp}.zip`;
  const tmpDb = path.join(dir, `tmp-${stamp}.db`);
  const db = getDb();
  db.pragma("wal_checkpoint(TRUNCATE)");
  await db.backup(tmpDb);
  try {
    const data = fs.readFileSync(tmpDb);
    const zip = zipStore([{ name: "parking-local.db", data }]);
    const dest = path.join(dir, filename);
    fs.writeFileSync(dest, zip);
    pruneOldBackups(dir);
    if (user) {
      writeAudit({
        user,
        operation: "BACKUP_CREATE",
        entityType: "backup",
        entityId: filename,
        newValue: { filename, size: zip.length },
      });
    }
    return { filename, size: zip.length, path: dest };
  } finally {
    try {
      fs.unlinkSync(tmpDb);
    } catch {
      /* ignore */
    }
  }
}

export function backupFilePath(filename: string): string {
  if (!SAFE_NAME.test(filename)) {
    throw Object.assign(new Error("Nom de sauvegarde invalide"), { status: 400 });
  }
  const full = path.join(backupsDir(), filename);
  if (!fs.existsSync(full)) {
    throw Object.assign(new Error("Sauvegarde introuvable"), { status: 404 });
  }
  return full;
}

function sqliteFromZip(zipBuf: Buffer): Buffer {
  const entries = unzip(zipBuf);
  const dbFile =
    entries.find((e) => e.name.replace(/\\/g, "/").split("/").pop() === "parking-local.db") ||
    entries.find((e) => e.name.toLowerCase().endsWith(".db"));
  if (!dbFile) {
    throw Object.assign(new Error("Aucune base SQLite dans l'archive"), { status: 400 });
  }
  if (!dbFile.data.subarray(0, 16).toString("utf8").startsWith("SQLite format 3")) {
    throw Object.assign(new Error("Fichier SQLite invalide"), { status: 400 });
  }
  const tmp = path.join(ensureBackupsDir(), `check-${Date.now()}.db`);
  fs.writeFileSync(tmp, dbFile.data);
  const check = new Database(tmp, { readonly: true, fileMustExist: true });
  try {
    const ok = check.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'sales'").get() as { n: number };
    if (!ok?.n) throw Object.assign(new Error("Sauvegarde inconnue (table sales absente)"), { status: 400 });
  } finally {
    check.close();
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
  return dbFile.data;
}

export function restoreFromZip(zipBuf: Buffer, user: AuthUser) {
  const sqlite = sqliteFromZip(zipBuf);
  const dest = getDbPath();
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const incoming = path.join(dir, `restore-${Date.now()}.db`);
  fs.writeFileSync(incoming, sqlite);

  const live = getDb();
  try {
    live.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    /* ignore */
  }
  closeDb();

  fs.copyFileSync(incoming, dest);
  for (const extra of [`${dest}-wal`, `${dest}-shm`]) {
    try {
      fs.unlinkSync(extra);
    } catch {
      /* ignore */
    }
  }
  try {
    fs.unlinkSync(incoming);
  } catch {
    /* ignore */
  }

  getDb();
  seedIfNeeded();
  writeAudit({
    user,
    operation: "BACKUP_RESTORE",
    entityType: "backup",
    newValue: { restoredBytes: sqlite.length },
  });
  return { ok: true };
}
