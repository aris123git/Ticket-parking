import crypto from "node:crypto";
import { nowIso, periodRange, type PeriodFilter } from "@parkflow/shared";
import { getDb } from "./db.js";
import { hashApiKey } from "./seed.js";

export function publicInstallation(row: Record<string, unknown>) {
  const copy = { ...row };
  delete copy.api_key_hash;
  return copy;
}

export function authenticateInstallation(publicId: string, apiKey: string) {
  const db = getDb();
  const inst = db.prepare("SELECT * FROM installations WHERE public_id = ?").get(publicId) as Record<string, unknown> | undefined;
  if (!inst) return null;
  const expected = Buffer.from(String(inst.api_key_hash), "hex");
  const given = Buffer.from(hashApiKey(apiKey), "hex");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return inst;
}

export function upsertInstallation(payload: {
  installationId: string;
  apiKey: string;
  pairingCode: string;
  parking: { name?: string; address?: string; phone?: string };
}) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM installations WHERE public_id = ?").get(payload.installationId) as
    | Record<string, unknown>
    | undefined;
  const now = nowIso();
  if (!existing) {
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO installations (id, public_id, api_key_hash, pairing_code, name, address, phone, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      payload.installationId,
      hashApiKey(payload.apiKey),
      payload.pairingCode,
      payload.parking.name || "Parking",
      payload.parking.address || "",
      payload.parking.phone || "",
      now,
      now,
    );
    return db.prepare("SELECT * FROM installations WHERE id = ?").get(id) as Record<string, unknown>;
  }

  const expected = String(existing.api_key_hash);
  const given = hashApiKey(payload.apiKey);
  if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"))) {
    throw Object.assign(new Error("Cle d'installation invalide"), { status: 401 });
  }
  db.prepare(
    `UPDATE installations SET pairing_code = ?, name = ?, address = ?, phone = ?, last_seen_at = ? WHERE id = ?`,
  ).run(
    payload.pairingCode,
    payload.parking.name || existing.name,
    payload.parking.address || existing.address,
    payload.parking.phone || existing.phone,
    now,
    existing.id,
  );
  return db.prepare("SELECT * FROM installations WHERE id = ?").get(existing.id) as Record<string, unknown>;
}

export function ingestSync(installation: Record<string, unknown>, body: any) {
  const db = getDb();
  const instId = String(installation.id);
  const now = nowIso();
  const saleIds: string[] = [];
  const auditIds: string[] = [];
  const closureIds: string[] = [];

  const upsertSale = db.prepare(
    `INSERT INTO sales (
      id, installation_id, local_id, ticket_number, tariff_ref, tariff_name, duration_value, duration_unit,
      price_fcfa, cashier_id, cashier_name, status, sold_at, cancelled_at, cancelled_by_name, cancel_reason,
      refunded_at, refunded_by_name, refund_reason, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(installation_id, local_id) DO UPDATE SET
      status = excluded.status,
      cancelled_at = excluded.cancelled_at,
      cancelled_by_name = excluded.cancelled_by_name,
      cancel_reason = excluded.cancel_reason,
      refunded_at = excluded.refunded_at,
      refunded_by_name = excluded.refunded_by_name,
      refund_reason = excluded.refund_reason`,
  );

  db.transaction(() => {
    for (const s of body.sales || []) {
      upsertSale.run(
        crypto.randomUUID(),
        instId,
        s.id,
        s.ticket_number,
        s.tariff_ref,
        s.tariff_name,
        s.duration_value,
        s.duration_unit,
        s.price_fcfa,
        s.cashier_id,
        s.cashier_name,
        s.status,
        s.sold_at,
        s.cancelled_at,
        s.cancelled_by_name,
        s.cancel_reason,
        s.refunded_at,
        s.refunded_by_name,
        s.refund_reason,
        now,
      );
      saleIds.push(s.id);
    }

    const upsertTariff = db.prepare(
      `INSERT INTO tariffs (id, installation_id, local_id, reference, name, duration_value, duration_unit, price_fcfa, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(installation_id, local_id) DO UPDATE SET
         reference = excluded.reference, name = excluded.name, duration_value = excluded.duration_value,
         duration_unit = excluded.duration_unit, price_fcfa = excluded.price_fcfa, is_active = excluded.is_active, updated_at = excluded.updated_at`,
    );
    for (const t of body.tariffs || []) {
      upsertTariff.run(
        crypto.randomUUID(),
        instId,
        t.id,
        t.reference,
        t.name,
        t.duration_value,
        t.duration_unit,
        t.price_fcfa,
        t.is_active,
        t.updated_at || now,
      );
    }

    const upsertCashier = db.prepare(
      `INSERT INTO cashiers (id, installation_id, local_id, username, display_name, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(installation_id, local_id) DO UPDATE SET
         username = excluded.username, display_name = excluded.display_name, role = excluded.role, is_active = excluded.is_active`,
    );
    for (const c of body.cashiers || []) {
      upsertCashier.run(crypto.randomUUID(), instId, c.id, c.username, c.display_name, c.role, c.is_active);
    }

    const upsertAudit = db.prepare(
      `INSERT INTO audit_events (
        id, installation_id, local_id, user_name, user_role, operation, entity_type, entity_id, old_value, new_value, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(installation_id, local_id) DO NOTHING`,
    );
    for (const a of body.audit || []) {
      upsertAudit.run(
        crypto.randomUUID(),
        instId,
        a.id,
        a.user_name,
        a.user_role,
        a.operation,
        a.entity_type,
        a.entity_id,
        a.old_value,
        a.new_value,
        a.reason,
        a.created_at,
      );
      auditIds.push(a.id);
    }

    const upsertClosure = db.prepare(
      `INSERT INTO cash_closures (
        id, installation_id, local_id, cashier_name, period_start, period_end, theoretical_amount, declared_amount,
        difference, tickets_count, notes, closed_by_name, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(installation_id, local_id) DO NOTHING`,
    );
    for (const c of body.closures || []) {
      upsertClosure.run(
        crypto.randomUUID(),
        instId,
        c.id,
        c.cashier_name,
        c.period_start,
        c.period_end,
        c.theoretical_amount,
        c.declared_amount,
        c.difference,
        c.tickets_count,
        c.notes,
        c.closed_by_name,
        c.closed_at,
      );
      closureIds.push(c.id);
    }
  })();

  return { saleIds, auditIds, closureIds, claimed: Boolean(installation.owner_id) };
}

export function ownerInstallations(ownerId: string) {
  return getDb().prepare("SELECT * FROM installations WHERE owner_id = ? ORDER BY name").all(ownerId) as Record<
    string,
    unknown
  >[];
}

export function getOwnedInstallation(ownerId: string, installationId: string) {
  const row = getDb()
    .prepare("SELECT * FROM installations WHERE id = ? AND owner_id = ?")
    .get(installationId, ownerId) as Record<string, unknown> | undefined;
  return row || null;
}

export function statsForInstallations(installationIds: string[], filter: PeriodFilter, from?: string, to?: string) {
  if (!installationIds.length) {
    return { revenue: 0, ticketsSold: 0, parkings: [], byReference: [], byCashier: [], sales: [] };
  }
  const range = periodRange(filter, from, to);
  const placeholders = installationIds.map(() => "?").join(",");
  const sales = getDb()
    .prepare(
      `SELECT s.*, i.name AS parking_name FROM sales s
       JOIN installations i ON i.id = s.installation_id
       WHERE s.installation_id IN (${placeholders}) AND s.sold_at >= ? AND s.sold_at < ?
       ORDER BY s.sold_at DESC`,
    )
    .all(...installationIds, range.start, range.end) as Record<string, unknown>[];

  const sold = sales.filter((s) => s.status === "SOLD");
  const byParking = new Map<string, { id: string; name: string; revenue: number; tickets: number }>();
  for (const id of installationIds) byParking.set(id, { id, name: "", revenue: 0, tickets: 0 });
  for (const s of sold) {
    const cur = byParking.get(String(s.installation_id)) || {
      id: String(s.installation_id),
      name: String(s.parking_name),
      revenue: 0,
      tickets: 0,
    };
    cur.name = String(s.parking_name);
    cur.revenue += Number(s.price_fcfa);
    cur.tickets += 1;
    byParking.set(String(s.installation_id), cur);
  }

  const byRef = new Map<string, { reference: string; count: number; amount: number }>();
  const byCashier = new Map<string, { cashierName: string; count: number; amount: number }>();
  for (const s of sold) {
    const r = byRef.get(String(s.tariff_ref)) || { reference: String(s.tariff_ref), count: 0, amount: 0 };
    r.count += 1;
    r.amount += Number(s.price_fcfa);
    byRef.set(String(s.tariff_ref), r);
    const c = byCashier.get(String(s.cashier_name)) || { cashierName: String(s.cashier_name), count: 0, amount: 0 };
    c.count += 1;
    c.amount += Number(s.price_fcfa);
    byCashier.set(String(s.cashier_name), c);
  }

  return {
    range,
    revenue: sold.reduce((a, s) => a + Number(s.price_fcfa), 0),
    ticketsSold: sold.length,
    ticketsCancelled: sales.filter((s) => s.status === "CANCELLED").length,
    ticketsRefunded: sales.filter((s) => s.status === "REFUNDED").length,
    parkings: [...byParking.values()],
    byReference: [...byRef.values()].sort((a, b) => b.amount - a.amount),
    byCashier: [...byCashier.values()].sort((a, b) => b.amount - a.amount),
    sales: sales.slice(0, 250),
  };
}

export function claimInstallation(ownerId: string, pairingCode: string) {
  const code = pairingCode.trim().toUpperCase();
  const inst = getDb().prepare("SELECT * FROM installations WHERE UPPER(pairing_code) = ?").get(code) as
    | Record<string, unknown>
    | undefined;
  if (!inst) throw Object.assign(new Error("Code d'association introuvable"), { status: 404 });
  if (inst.owner_id && inst.owner_id !== ownerId) {
    throw Object.assign(new Error("Cette installation est deja associee a un autre compte"), { status: 409 });
  }
  getDb()
    .prepare("UPDATE installations SET owner_id = ?, claimed_at = ? WHERE id = ?")
    .run(ownerId, nowIso(), inst.id);
  return getDb().prepare("SELECT * FROM installations WHERE id = ?").get(inst.id);
}
