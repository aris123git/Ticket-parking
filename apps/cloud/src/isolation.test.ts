import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcryptjs";
import { nowIso } from "@parkflow/shared";
import { closeDb, getDb, openMemoryDb } from "./db.js";
import { claimInstallation, ingestSync, statsForInstallations, upsertInstallation } from "./installations.js";
import { hashApiKey } from "./seed.js";

test("owners never see another owner's parking sales", () => {
  closeDb();
  const db = openMemoryDb();
  const now = nowIso();
  db.prepare("INSERT INTO owners (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    "owner-a",
    "a@x.com",
    "A",
    bcrypt.hashSync("secret1", 4),
    now,
  );
  db.prepare("INSERT INTO owners (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    "owner-b",
    "b@x.com",
    "B",
    bcrypt.hashSync("secret2", 4),
    now,
  );
  db.prepare(
    `INSERT INTO installations (id, public_id, api_key_hash, pairing_code, owner_id, name, created_at)
     VALUES ('inst-a', 'park_a', ?, 'AAAA-AAAA', 'owner-a', 'Parking A', ?)`,
  ).run(hashApiKey("key-a"), now);
  db.prepare(
    `INSERT INTO installations (id, public_id, api_key_hash, pairing_code, owner_id, name, created_at)
     VALUES ('inst-b', 'park_b', ?, 'BBBB-BBBB', 'owner-b', 'Parking B', ?)`,
  ).run(hashApiKey("key-b"), now);
  db.prepare(
    `INSERT INTO sales (id, installation_id, local_id, ticket_number, tariff_ref, tariff_name, duration_value, duration_unit, price_fcfa, cashier_name, status, sold_at, received_at)
     VALUES ('s1', 'inst-a', 'l1', '202609-000001', '24H', '24h', 24, 'HOURS', 1000, 'C1', 'SOLD', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO sales (id, installation_id, local_id, ticket_number, tariff_ref, tariff_name, duration_value, duration_unit, price_fcfa, cashier_name, status, sold_at, received_at)
     VALUES ('s2', 'inst-b', 'l2', '202609-000001', '24H', '24h', 24, 'HOURS', 8000, 'C2', 'SOLD', ?, ?)`,
  ).run(now, now);

  const a = statsForInstallations(["inst-a"], "month");
  const b = statsForInstallations(["inst-b"], "month");
  assert.equal(a.revenue, 1000);
  assert.equal(b.revenue, 8000);
  assert.equal(a.sales.every((s) => s.installation_id === "inst-a"), true);
  closeDb();
});

test("sync is idempotent and keeps sale price snapshots", () => {
  closeDb();
  openMemoryDb();
  const inst = upsertInstallation({
    installationId: "park_sync",
    apiKey: "secret-key",
    pairingCode: "ZZZZ-ZZZZ",
    parking: { name: "Parking Central" },
  });
  const sale = {
    id: "local-sale-1",
    ticket_number: "202609-000010",
    tariff_ref: "24H",
    tariff_name: "24 heures",
    duration_value: 24,
    duration_unit: "HOURS",
    price_fcfa: 1000,
    cashier_id: "c1",
    cashier_name: "Aminata",
    status: "SOLD",
    sold_at: nowIso(),
  };
  ingestSync(inst, { sales: [sale] });
  ingestSync(inst, { sales: [{ ...sale, status: "CANCELLED", cancel_reason: "erreur", cancelled_by_name: "Admin" }] });
  const rows = getDb().prepare("SELECT * FROM sales WHERE installation_id = ?").all(inst.id) as { price_fcfa: number; status: string }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price_fcfa, 1000);
  assert.equal(rows[0].status, "CANCELLED");
  closeDb();
});

test("pairing code cannot steal another owner's installation", () => {
  closeDb();
  const db = openMemoryDb();
  const now = nowIso();
  db.prepare("INSERT INTO owners (id, email, display_name, password_hash, created_at) VALUES ('oa', 'a@x.com', 'A', ?, ?)").run(
    bcrypt.hashSync("x", 4),
    now,
  );
  db.prepare("INSERT INTO owners (id, email, display_name, password_hash, created_at) VALUES ('ob', 'b@x.com', 'B', ?, ?)").run(
    bcrypt.hashSync("x", 4),
    now,
  );
  upsertInstallation({
    installationId: "park_claim",
    apiKey: "k",
    pairingCode: "CLAIM-001",
    parking: { name: "Central" },
  });
  claimInstallation("oa", "CLAIM-001");
  assert.throws(() => claimInstallation("ob", "CLAIM-001"));
  closeDb();
});
