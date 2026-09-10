import crypto from "node:crypto";
import { nowIso, periodFromDate, DEFAULT_TIMEZONE } from "@parkflow/shared";
import { getDb } from "./db.js";
import { writeAudit } from "./audit.js";
import { printTicket } from "./printer.js";
import type { AuthUser } from "./seed.js";

export type SaleRow = Record<string, unknown>;

export function nextTicketNumber(soldAt = new Date(), timeZone = DEFAULT_TIMEZONE): { period: string; sequence: number; ticketNumber: string } {
  const db = getDb();
  const period = periodFromDate(soldAt, timeZone);
  const current = db.prepare("SELECT last_number FROM ticket_sequences WHERE period = ?").get(period) as
    | { last_number: number }
    | undefined;
  const sequence = (current?.last_number ?? 0) + 1;
  if (current) {
    db.prepare("UPDATE ticket_sequences SET last_number = ? WHERE period = ?").run(sequence, period);
  } else {
    db.prepare("INSERT INTO ticket_sequences (period, last_number) VALUES (?, ?)").run(period, sequence);
  }
  const ticketNumber = `${period}-${String(sequence).padStart(6, "0")}`;
  return { period, sequence, ticketNumber };
}

export function createSale(tariffId: string, user: AuthUser) {
  const db = getDb();
  return db.transaction(() => {
    const tariff = db
      .prepare("SELECT * FROM tariffs WHERE id = ? AND is_active = 1")
      .get(tariffId) as Record<string, unknown> | undefined;
    if (!tariff) {
      throw Object.assign(new Error("Tarif introuvable ou inactif"), { status: 400 });
    }

    const soldAt = new Date();
    const numbering = nextTicketNumber(soldAt);
    const id = crypto.randomUUID();
    const soldAtIso = soldAt.toISOString();

    db.prepare(
      `INSERT INTO sales (
        id, ticket_number, period, sequence, tariff_id, tariff_ref, tariff_name,
        duration_value, duration_unit, price_fcfa, cashier_id, cashier_name,
        status, sold_at, print_status, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SOLD', ?, 'PENDING', 'PENDING')`,
    ).run(
      id,
      numbering.ticketNumber,
      numbering.period,
      numbering.sequence,
      tariff.id,
      tariff.reference,
      tariff.name,
      tariff.duration_value,
      tariff.duration_unit,
      tariff.price_fcfa,
      user.id,
      user.displayName,
      soldAtIso,
    );

    writeAudit({
      user,
      operation: "SALE_CREATE",
      entityType: "sale",
      entityId: id,
      newValue: {
        ticketNumber: numbering.ticketNumber,
        tariffRef: tariff.reference,
        priceFcfa: tariff.price_fcfa,
      },
    });

    return db.prepare("SELECT * FROM sales WHERE id = ?").get(id) as SaleRow;
  })();
}

export async function createSaleAndPrint(tariffId: string, user: AuthUser) {
  const sale = createSale(tariffId, user);
  const printed = await printTicket({
    tariff_ref: String(sale.tariff_ref),
    tariff_name: String(sale.tariff_name),
    duration_value: Number(sale.duration_value),
    duration_unit: sale.duration_unit as "HOURS" | "WEEKS",
    price_fcfa: Number(sale.price_fcfa),
    ticket_number: String(sale.ticket_number),
    sold_at: String(sale.sold_at),
    cashier_name: String(sale.cashier_name),
  });

  getDb()
    .prepare("UPDATE sales SET print_status = ?, printed_at = ?, print_error = ? WHERE id = ?")
    .run(printed.ok ? "PRINTED" : "FAILED", printed.ok ? nowIso() : null, printed.error ?? null, sale.id);

  return {
    sale: getDb().prepare("SELECT * FROM sales WHERE id = ?").get(sale.id),
    print: printed,
  };
}

export function changeSaleStatus(
  saleId: string,
  status: "CANCELLED" | "REFUNDED",
  user: AuthUser,
  reason: string,
) {
  const db = getDb();
  const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId) as SaleRow | undefined;
  if (!sale) throw Object.assign(new Error("Vente introuvable"), { status: 404 });
  if (sale.status !== "SOLD") {
    throw Object.assign(new Error("Cette vente a deja un statut definitif"), { status: 400 });
  }
  if (!reason || reason.trim().length < 3) {
    throw Object.assign(new Error("Une raison d'au moins 3 caracteres est obligatoire"), { status: 400 });
  }

  const now = nowIso();
  if (status === "CANCELLED") {
    db.prepare(
      `UPDATE sales SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancelled_by_name = ?,
       cancel_reason = ?, sync_status = 'PENDING' WHERE id = ?`,
    ).run(now, user.id, user.displayName, reason.trim(), saleId);
  } else {
    db.prepare(
      `UPDATE sales SET status = 'REFUNDED', refunded_at = ?, refunded_by = ?, refunded_by_name = ?,
       refund_reason = ?, sync_status = 'PENDING' WHERE id = ?`,
    ).run(now, user.id, user.displayName, reason.trim(), saleId);
  }

  writeAudit({
    user,
    operation: status === "CANCELLED" ? "SALE_CANCEL" : "SALE_REFUND",
    entityType: "sale",
    entityId: saleId,
    oldValue: { status: sale.status, ticketNumber: sale.ticket_number, priceFcfa: sale.price_fcfa },
    newValue: { status, reason: reason.trim() },
    reason: reason.trim(),
  });

  return db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId);
}
