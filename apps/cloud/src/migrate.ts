import type Database from "better-sqlite3";

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

export function migrateCloudSchema(db: Database.Database): void {
  if (!hasColumn(db, "sales", "payment_method")) {
    db.exec("ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'CASH'");
  }
  if (!hasColumn(db, "sales", "amount_received")) {
    db.exec("ALTER TABLE sales ADD COLUMN amount_received INTEGER");
  }
  if (!hasColumn(db, "sales", "change_fcfa")) {
    db.exec("ALTER TABLE sales ADD COLUMN change_fcfa INTEGER NOT NULL DEFAULT 0");
  }
}
