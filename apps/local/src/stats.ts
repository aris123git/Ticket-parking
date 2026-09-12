import { periodRange, type PeriodFilter } from "@parkflow/shared";
import { getDb } from "./db.js";

export function dashboard(filter: PeriodFilter, from?: string, to?: string) {
  const db = getDb();
  const range = periodRange(filter, from, to);
  const sales = db
    .prepare(
      `SELECT * FROM sales WHERE sold_at >= ? AND sold_at < ? ORDER BY sold_at ASC`,
    )
    .all(range.start, range.end) as Record<string, unknown>[];

  const sold = sales.filter((s) => s.status === "SOLD");
  const cancelled = sales.filter((s) => s.status === "CANCELLED");
  const refunded = sales.filter((s) => s.status === "REFUNDED");
  const revenue = sold.reduce((acc, s) => acc + Number(s.price_fcfa), 0);

  const byRef = new Map<string, { reference: string; name: string; count: number; amount: number }>();
  for (const s of sold) {
    const key = String(s.tariff_ref);
    const cur = byRef.get(key) || { reference: key, name: String(s.tariff_name), count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(s.price_fcfa);
    byRef.set(key, cur);
  }

  const byCashier = new Map<string, { cashierId: string; cashierName: string; count: number; amount: number }>();
  for (const s of sold) {
    const key = String(s.cashier_id);
    const cur = byCashier.get(key) || {
      cashierId: key,
      cashierName: String(s.cashier_name),
      count: 0,
      amount: 0,
    };
    cur.count += 1;
    cur.amount += Number(s.price_fcfa);
    byCashier.set(key, cur);
  }

  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, amount: 0 }));
  for (const s of sold) {
    const hour = new Date(String(s.sold_at)).getHours();
    byHour[hour].count += 1;
    byHour[hour].amount += Number(s.price_fcfa);
  }

  const byPayment = new Map<string, { method: string; count: number; amount: number }>();
  for (const s of sold) {
    const method = String(s.payment_method || "CASH");
    const cur = byPayment.get(method) || { method, count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(s.price_fcfa);
    byPayment.set(method, cur);
  }

  return {
    range,
    revenue,
    ticketsSold: sold.length,
    ticketsCancelled: cancelled.length,
    ticketsRefunded: refunded.length,
    byReference: [...byRef.values()].sort((a, b) => b.amount - a.amount),
    byCashier: [...byCashier.values()].sort((a, b) => b.amount - a.amount),
    byHour,
    byPayment: [...byPayment.values()].sort((a, b) => b.amount - a.amount),
    recent: sales.slice(-12).reverse(),
  };
}

export function pendingSyncCounts() {
  const db = getDb();
  const sales = (db.prepare("SELECT COUNT(*) AS n FROM sales WHERE sync_status != 'SYNCED'").get() as { n: number }).n;
  const audit = (db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE sync_status != 'SYNCED'").get() as { n: number }).n;
  const closures = (
    db.prepare("SELECT COUNT(*) AS n FROM cash_closures WHERE sync_status != 'SYNCED'").get() as { n: number }
  ).n;
  return { sales, audit, closures, total: sales + audit + closures };
}
