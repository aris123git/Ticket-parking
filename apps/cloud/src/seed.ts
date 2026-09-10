import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { nowIso } from "@parkflow/shared";
import { getDb } from "./db.js";

export function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export function seedCloud(): void {
  const db = getDb();
  const n = (db.prepare("SELECT COUNT(*) AS n FROM owners").get() as { n: number }).n;
  if (n > 0) return;

  const now = nowIso();
  const ownerId = crypto.randomUUID();
  db.prepare("INSERT INTO owners (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    ownerId,
    "proprio@parking.local",
    "Wendmanegde Gilles Aristide SAWADOGO",
    bcrypt.hashSync("proprio123", 10),
    now,
  );

  const demos = [
    { name: "Parking Aeroport", address: "Aeroport de Ouagadougou", phone: "+226 70 11 11 11", revenue: [1200, 1000, 500, 8000] },
    { name: "Parking Zone du Bois", address: "Ouaga 2000 / Zone du Bois", phone: "+226 70 22 22 22", revenue: [250, 500, 1000, 5000] },
    { name: "Parking Ouaga 2000", address: "Boulevard Tengandogo", phone: "+226 70 33 33 33", revenue: [1000, 1000, 250, 8000] },
  ];

  const refs = [
    { ref: "1H", name: "1 heure", dur: 1, unit: "HOURS", price: 250 },
    { ref: "6H", name: "6 heures", dur: 6, unit: "HOURS", price: 500 },
    { ref: "24H", name: "24 heures", dur: 24, unit: "HOURS", price: 1000 },
    { ref: "1S", name: "1 semaine", dur: 1, unit: "WEEKS", price: 5000 },
    { ref: "2S", name: "2 semaines", dur: 2, unit: "WEEKS", price: 8000 },
  ];

  demos.forEach((demo, idx) => {
    const instId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO installations (id, public_id, api_key_hash, pairing_code, owner_id, name, address, phone, claimed_at, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      instId,
      `park_demo_${crypto.randomBytes(16).toString("hex")}`,
      hashApiKey(`demo-key-${idx}`),
      `DEMO-${idx + 1}XXX`,
      ownerId,
      demo.name,
      demo.address,
      demo.phone,
      now,
      now,
      now,
    );

    for (const t of refs) {
      db.prepare(
        `INSERT INTO tariffs (id, installation_id, local_id, reference, name, duration_value, duration_unit, price_fcfa, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ).run(crypto.randomUUID(), instId, crypto.randomUUID(), t.ref, t.name, t.dur, t.unit, t.price, now);
    }

    db.prepare(
      `INSERT INTO cashiers (id, installation_id, local_id, username, display_name, role, is_active)
       VALUES (?, ?, ?, ?, ?, 'CASHIER', 1)`,
    ).run(crypto.randomUUID(), instId, crypto.randomUUID(), "caissier", idx === 0 ? "Issa Kaboré" : idx === 1 ? "Fatou Diallo" : "Boukary Sawadogo");

    const base = Date.now();
    for (let i = 0; i < 18; i++) {
      const t = refs[i % refs.length];
      const soldAt = new Date(base - i * 37 * 60 * 1000).toISOString();
      db.prepare(
        `INSERT INTO sales (
          id, installation_id, local_id, ticket_number, tariff_ref, tariff_name, duration_value, duration_unit,
          price_fcfa, cashier_name, status, sold_at, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SOLD', ?, ?)`,
      ).run(
        crypto.randomUUID(),
        instId,
        crypto.randomUUID(),
        `${new Date().toISOString().slice(0, 7).replace("-", "")}-${String(100 + idx * 20 + i).padStart(6, "0")}`,
        t.ref,
        t.name,
        t.dur,
        t.unit,
        t.price,
        idx === 0 ? "Issa Kabore" : idx === 1 ? "Fatou Diallo" : "Boukary Sawadogo",
        soldAt,
        now,
      );
    }
  });
}
