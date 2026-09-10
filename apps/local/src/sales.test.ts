import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcryptjs";
import { nowIso } from "@parkflow/shared";
import { closeDb, getDb, openMemoryDb } from "./db.js";
import { changeSaleStatus, createSale, nextTicketNumber } from "./sales.js";
import { setSetting } from "./seed.js";

const cashier = {
  id: "cashier-1",
  username: "caissier",
  displayName: "Aminata",
  role: "CASHIER" as const,
  isActive: true,
};

const admin = {
  id: "admin-1",
  username: "admin",
  displayName: "Admin",
  role: "ADMIN" as const,
  isActive: true,
};

function seedMemory() {
  closeDb();
  const db = openMemoryDb();
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(admin.id, admin.username, admin.displayName, bcrypt.hashSync("x", 4), "ADMIN", now, now);
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(cashier.id, cashier.username, cashier.displayName, bcrypt.hashSync("x", 4), "CASHIER", now, now);
  db.prepare(
    `INSERT INTO tariffs (id, reference, name, duration_value, duration_unit, price_fcfa, is_active, created_at, updated_at)
     VALUES (?, '24H', '24 heures', 24, 'HOURS', 1000, 1, ?, ?)`,
  ).run("tariff-24", now, now);
  setSetting("parking_name", "Parking Central");
  setSetting("printer_target", "preview");
  setSetting("printer_width", "80");
  return db;
}

test("ticket numbers increment without duplicates in the same month", () => {
  seedMemory();
  const a = nextTicketNumber(new Date("2026-09-10T10:00:00Z"));
  const b = nextTicketNumber(new Date("2026-09-10T10:01:00Z"));
  assert.equal(a.period, "202609");
  assert.equal(a.ticketNumber, "202609-000001");
  assert.equal(b.ticketNumber, "202609-000002");
  closeDb();
});

test("changing a tariff price does not rewrite past sales", () => {
  const db = seedMemory();
  const sale = createSale("tariff-24", cashier);
  assert.equal(sale.price_fcfa, 1000);
  db.prepare("UPDATE tariffs SET price_fcfa = 1500 WHERE id = 'tariff-24'").run();
  const stored = db.prepare("SELECT price_fcfa FROM sales WHERE id = ?").get(sale.id) as { price_fcfa: number };
  assert.equal(stored.price_fcfa, 1000);
  const later = createSale("tariff-24", cashier);
  assert.equal(later.price_fcfa, 1500);
  closeDb();
});

test("cancel and refund keep the original sale row", () => {
  seedMemory();
  const sale = createSale("tariff-24", cashier);
  const cancelled = changeSaleStatus(String(sale.id), "CANCELLED", admin, "Erreur de saisie") as Record<string, unknown>;
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.price_fcfa, 1000);
  assert.ok(cancelled.cancel_reason);
  const count = getDb().prepare("SELECT COUNT(*) AS n FROM sales").get() as { n: number };
  assert.equal(count.n, 1);
  const audit = getDb().prepare("SELECT COUNT(*) AS n FROM audit_log WHERE operation = 'SALE_CANCEL'").get() as { n: number };
  assert.equal(audit.n, 1);
  closeDb();
});
