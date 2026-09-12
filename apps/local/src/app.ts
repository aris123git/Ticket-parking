import crypto from "node:crypto";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { isValidTariffRef, normalizeTariffRef, nowIso, periodRange } from "@parkflow/shared";
import { adminOnly, authRequired, clearAuthCookie, setAuthCookie, signUser, type AuthedRequest } from "./auth.js";
import { writeAudit } from "./audit.js";
import { backupFilePath, createBackup, listBackupFiles, restoreFromZip } from "./backup.js";
import { getDb } from "./db.js";
import { listWindowsPrinters, printTicket, printZReport, printerConfig, saleFromRow } from "./printer.js";
import { changeSaleStatus, createSaleAndPrint, lastSale } from "./sales.js";
import {
  allSettings,
  completeSetup,
  getSetting,
  mapUser,
  regeneratePairingCode,
  setSetting,
  setupNeeded,
  type AuthUser,
} from "./seed.js";
import { dashboard } from "./stats.js";
import { getSyncState, installationPublic, runSyncOnce } from "./sync.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use(
    cors({
      origin: [/^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/localhost:\d+$/],
      credentials: true,
    }),
  );

  app.post(
    "/api/backups/restore-upload",
    authRequired,
    adminOnly,
    express.raw({ type: () => true, limit: "80mb" }),
    (req: AuthedRequest, res) => {
      try {
        const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
        restoreFromZip(buf, req.user!);
        res.json({ ok: true });
      } catch (err) {
        sendErr(res, err);
      }
    },
  );

  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, role: "local-parking" });
  });

  app.get("/api/setup/status", (_req, res) => {
    res.json({ needed: setupNeeded(), parkingName: getSetting("parking_name") || "Parking" });
  });

  app.post("/api/setup", (req, res) => {
    try {
      const result = completeSetup(req.body || {});
      res.json({ ok: true, ...result });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: "Identifiants requis" });
      return;
    }
    const row = getDb()
      .prepare("SELECT * FROM users WHERE username = ?")
      .get(String(username).trim()) as Record<string, unknown> | undefined;
    if (!row || !bcrypt.compareSync(String(password), String(row.password_hash))) {
      res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });
      return;
    }
    if (!row.is_active) {
      res.status(403).json({ error: "Compte desactive" });
      return;
    }
    const user = mapUser(row);
    const token = signUser(user);
    setAuthCookie(res, token);
    writeAudit({ user, operation: "LOGIN", entityType: "session", entityId: user.id });
    res.json({ user, token });
  });

  app.post("/api/auth/logout", authRequired, (req: AuthedRequest, res) => {
    if (req.user) {
      writeAudit({ user: req.user, operation: "LOGOUT", entityType: "session", entityId: req.user.id });
    }
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", authRequired, (req: AuthedRequest, res) => {
    res.json({
      user: req.user,
      parkingName: getSetting("parking_name"),
      sync: getSyncState(),
      setupDone: !setupNeeded(),
    });
  });

  app.get("/api/tariffs", authRequired, (req: AuthedRequest, res) => {
    const onlyActive = req.user?.role !== "ADMIN" || req.query.all !== "1";
    const sql = onlyActive
      ? "SELECT * FROM tariffs WHERE is_active = 1 ORDER BY price_fcfa ASC"
      : "SELECT * FROM tariffs ORDER BY is_active DESC, price_fcfa ASC";
    res.json({ tariffs: getDb().prepare(sql).all() });
  });

  app.post("/api/tariffs", authRequired, adminOnly, (req: AuthedRequest, res) => {
    try {
      const tariff = upsertTariff(null, req.body, req.user!);
      res.status(201).json({ tariff });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.put("/api/tariffs/:id", authRequired, adminOnly, (req: AuthedRequest, res) => {
    try {
      const tariff = upsertTariff(req.params.id, req.body, req.user!);
      res.json({ tariff });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.post("/api/sales", authRequired, async (req: AuthedRequest, res) => {
    try {
      const tariffId = String(req.body?.tariffId || "");
      const result = await createSaleAndPrint(tariffId, req.user!, {
        method: req.body?.paymentMethod,
        amountReceived: req.body?.amountReceived,
      });
      res.status(201).json(result);
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.get("/api/sales", authRequired, (req: AuthedRequest, res) => {
    const filter = String(req.query.period || "today") as "today" | "yesterday" | "week" | "month" | "custom";
    const range = periodRange(filter, String(req.query.from || ""), String(req.query.to || ""));
    const rows = getDb()
      .prepare("SELECT * FROM sales WHERE sold_at >= ? AND sold_at < ? ORDER BY sold_at DESC LIMIT 500")
      .all(range.start, range.end);
    res.json({ sales: rows, range });
  });

  app.get("/api/sales/last", authRequired, (_req, res) => {
    res.json({ sale: lastSale() || null });
  });

  app.post("/api/sales/last/reprint", authRequired, async (req: AuthedRequest, res) => {
    try {
      const sale = lastSale();
      if (!sale) {
        res.status(404).json({ error: "Aucune vente a reimprimer" });
        return;
      }
      const printed = await reprintSale(sale, req.user!);
      res.json({ sale, print: printed });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.get("/api/sales/:id", authRequired, (req: AuthedRequest, res) => {
    const sale = getDb().prepare("SELECT * FROM sales WHERE id = ?").get(req.params.id);
    if (!sale) {
      res.status(404).json({ error: "Vente introuvable" });
      return;
    }
    res.json({ sale });
  });

  app.post("/api/sales/:id/reprint", authRequired, async (req: AuthedRequest, res) => {
    const sale = getDb().prepare("SELECT * FROM sales WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
    if (!sale) {
      res.status(404).json({ error: "Vente introuvable" });
      return;
    }
    const printed = await reprintSale(sale, req.user!);
    res.json({ print: printed });
  });

  app.post("/api/sales/:id/cancel", authRequired, adminOnly, (req: AuthedRequest, res) => {
    try {
      const sale = changeSaleStatus(req.params.id, "CANCELLED", req.user!, String(req.body?.reason || ""));
      res.json({ sale });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.post("/api/sales/:id/refund", authRequired, adminOnly, (req: AuthedRequest, res) => {
    try {
      const sale = changeSaleStatus(req.params.id, "REFUNDED", req.user!, String(req.body?.reason || ""));
      res.json({ sale });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.get("/api/dashboard", authRequired, (req: AuthedRequest, res) => {
    const filter = String(req.query.period || "today") as "today" | "yesterday" | "week" | "month" | "custom";
    res.json(dashboard(filter, String(req.query.from || ""), String(req.query.to || "")));
  });

  app.get("/api/users", authRequired, adminOnly, (_req, res) => {
    const users = getDb()
      .prepare("SELECT id, username, display_name, role, is_active, created_at, updated_at FROM users ORDER BY username")
      .all();
    res.json({ users });
  });

  app.post("/api/users", authRequired, adminOnly, (req: AuthedRequest, res) => {
    try {
      res.status(201).json({ user: upsertUser(null, req.body, req.user!) });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.put("/api/users/:id", authRequired, adminOnly, (req: AuthedRequest, res) => {
    try {
      res.json({ user: upsertUser(req.params.id, req.body, req.user!) });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.post("/api/cash-closures", authRequired, adminOnly, async (req: AuthedRequest, res) => {
    try {
      const filter = String(req.body?.period || "today") as "today" | "yesterday" | "week" | "month" | "custom";
      const cashierId = req.body?.cashierId ? String(req.body.cashierId) : null;
      const declared = Number(req.body?.declaredAmount);
      const notes = String(req.body?.notes || "");
      if (!Number.isFinite(declared) || declared < 0) {
        throw Object.assign(new Error("Montant declare invalide"), { status: 400 });
      }
      const range = periodRange(filter, String(req.body?.from || ""), String(req.body?.to || ""));
      let sql = `SELECT * FROM sales WHERE status = 'SOLD' AND sold_at >= ? AND sold_at < ?`;
      const params: unknown[] = [range.start, range.end];
      if (cashierId) {
        sql += " AND cashier_id = ?";
        params.push(cashierId);
      }
      const rows = getDb().prepare(sql).all(...params) as Record<string, unknown>[];
      const theoretical = rows.reduce((a, s) => a + Number(s.price_fcfa), 0);
      const cashierName = cashierId
        ? String(
            (getDb().prepare("SELECT display_name FROM users WHERE id = ?").get(cashierId) as { display_name?: string } | undefined)
              ?.display_name || "",
          )
        : "Tous les caissiers";
      const id = crypto.randomUUID();
      getDb()
        .prepare(
          `INSERT INTO cash_closures (
            id, cashier_id, cashier_name, period_start, period_end, theoretical_amount,
            declared_amount, difference, tickets_count, notes, closed_by_id, closed_by_name, closed_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        )
        .run(
          id,
          cashierId,
          cashierName,
          range.start,
          range.end,
          theoretical,
          declared,
          declared - theoretical,
          rows.length,
          notes,
          req.user!.id,
          req.user!.displayName,
          nowIso(),
        );
      const closure = getDb().prepare("SELECT * FROM cash_closures WHERE id = ?").get(id) as Record<string, unknown>;
      writeAudit({
        user: req.user!,
        operation: "CASH_CLOSE",
        entityType: "cash_closure",
        entityId: id,
        newValue: { theoretical, declared, difference: declared - theoretical, tickets: rows.length, cashierName },
        reason: notes || null,
      });
      const printed = await printZForRows(rows, closure);
      res.status(201).json({ closure, print: printed });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.post("/api/cash-closures/:id/print", authRequired, adminOnly, async (req: AuthedRequest, res) => {
    const closure = getDb().prepare("SELECT * FROM cash_closures WHERE id = ?").get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!closure) {
      res.status(404).json({ error: "Cloture introuvable" });
      return;
    }
    const rows = getDb()
      .prepare("SELECT * FROM sales WHERE status = 'SOLD' AND sold_at >= ? AND sold_at < ?")
      .all(closure.period_start, closure.period_end) as Record<string, unknown>[];
    const printed = await printZForRows(rows, closure);
    res.json({ print: printed });
  });

  app.get("/api/cash-closures", authRequired, adminOnly, (_req, res) => {
    res.json({
      closures: getDb().prepare("SELECT * FROM cash_closures ORDER BY closed_at DESC LIMIT 100").all(),
    });
  });

  app.get("/api/audit", authRequired, adminOnly, (req, res) => {
    const limit = Math.min(Number(req.query.limit || 200), 500);
    res.json({
      events: getDb().prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?").all(limit),
    });
  });

  app.get("/api/settings", authRequired, adminOnly, (_req, res) => {
    const s = allSettings();
    res.json({
      parkingName: s.parking_name,
      parkingAddress: s.parking_address,
      parkingPhone: s.parking_phone,
      ticketHeader: s.ticket_header,
      ticketFooter: s.ticket_footer,
      cloudUrl: s.cloud_url,
      timezone: s.timezone,
      printer: printerConfig(),
      setupDone: s.setup_done === "1",
    });
  });

  app.put("/api/settings", authRequired, adminOnly, (req: AuthedRequest, res) => {
    const body = req.body || {};
    const old = allSettings();
    const map: Record<string, string> = {
      parkingName: "parking_name",
      parkingAddress: "parking_address",
      parkingPhone: "parking_phone",
      ticketHeader: "ticket_header",
      ticketFooter: "ticket_footer",
      cloudUrl: "cloud_url",
    };
    for (const [from, to] of Object.entries(map)) {
      if (body[from] != null) setSetting(to, String(body[from]));
    }
    writeAudit({
      user: req.user!,
      operation: "SETTINGS_UPDATE",
      entityType: "settings",
      entityId: "parking",
      oldValue: { name: old.parking_name, address: old.parking_address },
      newValue: { name: getSetting("parking_name"), address: getSetting("parking_address") },
      reason: body.reason || null,
    });
    res.json({ ok: true });
  });

  app.put("/api/printer", authRequired, adminOnly, (req: AuthedRequest, res) => {
    const b = req.body || {};
    const old = printerConfig();
    if (b.width) setSetting("printer_width", String(b.width));
    if (b.target) setSetting("printer_target", String(b.target));
    if (b.host != null) setSetting("printer_host", String(b.host));
    if (b.port != null) setSetting("printer_port", String(b.port));
    if (b.path != null) setSetting("printer_path", String(b.path));
    if (b.printerName != null) setSetting("printer_name", String(b.printerName));
    if (b.alignment) setSetting("printer_alignment", String(b.alignment));
    if (b.fontSize != null) setSetting("printer_font_size", String(b.fontSize));
    const flags = ["showAddress", "showPhone", "showHeader", "showFooter", "showCashier"] as const;
    const keys = [
      "printer_show_address",
      "printer_show_phone",
      "printer_show_header",
      "printer_show_footer",
      "printer_show_cashier",
    ];
    flags.forEach((f, i) => {
      if (b[f] != null) setSetting(keys[i], b[f] ? "1" : "0");
    });
    writeAudit({
      user: req.user!,
      operation: "PRINTER_UPDATE",
      entityType: "printer",
      oldValue: old,
      newValue: printerConfig(),
    });
    res.json({ printer: printerConfig() });
  });

  app.post("/api/printer/test", authRequired, adminOnly, async (_req, res) => {
    const printed = await printTicket({
      tariff_ref: "24H",
      tariff_name: "Test",
      duration_value: 24,
      duration_unit: "HOURS",
      price_fcfa: 1000,
      ticket_number: "TEST-000000",
      sold_at: nowIso(),
      cashier_name: "Test",
      payment_method: "CASH",
      amount_received: 1000,
      change_fcfa: 0,
    });
    res.json({ print: printed });
  });

  app.get("/api/printer/windows", authRequired, adminOnly, async (_req, res) => {
    res.json({ printers: await listWindowsPrinters() });
  });

  app.get("/api/backups", authRequired, adminOnly, (_req, res) => {
    res.json({ backups: listBackupFiles() });
  });

  app.post("/api/backups", authRequired, adminOnly, async (req: AuthedRequest, res) => {
    try {
      const backup = await createBackup(req.user!);
      res.status(201).json({ backup: { filename: backup.filename, size: backup.size } });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.get("/api/backups/:filename", authRequired, adminOnly, (req, res) => {
    try {
      const file = backupFilePath(req.params.filename);
      res.download(file, req.params.filename);
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.post("/api/backups/:filename/restore", authRequired, adminOnly, (req: AuthedRequest, res) => {
    try {
      const file = backupFilePath(req.params.filename);
      restoreFromZip(fs.readFileSync(file), req.user!);
      res.json({ ok: true });
    } catch (err) {
      sendErr(res, err);
    }
  });

  app.get("/api/sync", authRequired, adminOnly, (_req, res) => {
    res.json({ ...getSyncState(), installation: installationPublic() });
  });

  app.post("/api/sync/now", authRequired, adminOnly, async (_req, res) => {
    const sync = await runSyncOnce();
    res.json({ ...sync, installation: installationPublic() });
  });

  app.post("/api/sync/pairing-code", authRequired, adminOnly, (req: AuthedRequest, res) => {
    const code = regeneratePairingCode();
    writeAudit({
      user: req.user!,
      operation: "PAIRING_REGENERATE",
      entityType: "installation",
      newValue: { pairingCode: code },
    });
    res.json({ pairingCode: code, installation: installationPublic() });
  });

  return app;
}

async function reprintSale(sale: Record<string, unknown>, user: AuthUser) {
  const printed = await printTicket(saleFromRow(sale), { duplicate: true });
  writeAudit({
    user,
    operation: "SALE_REPRINT",
    entityType: "sale",
    entityId: String(sale.id),
    newValue: { ticketNumber: sale.ticket_number, ok: printed.ok },
  });
  return printed;
}

async function printZForRows(rows: Record<string, unknown>[], closure: Record<string, unknown>) {
  const byPayment = new Map<string, { method: string; count: number; amount: number }>();
  for (const s of rows) {
    const method = String(s.payment_method || "CASH");
    const cur = byPayment.get(method) || { method, count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(s.price_fcfa);
    byPayment.set(method, cur);
  }
  return printZReport({
    closedAt: String(closure.closed_at),
    periodStart: String(closure.period_start),
    periodEnd: String(closure.period_end),
    ticketsCount: Number(closure.tickets_count),
    theoreticalAmount: Number(closure.theoretical_amount),
    declaredAmount: Number(closure.declared_amount),
    difference: Number(closure.difference),
    cashierName: String(closure.cashier_name || ""),
    closedByName: String(closure.closed_by_name || ""),
    notes: closure.notes ? String(closure.notes) : "",
    byPayment: [...byPayment.values()],
  });
}

function sendErr(res: express.Response, err: unknown) {
  const status = (err as { status?: number }).status || 500;
  const message = err instanceof Error ? err.message : "Erreur interne";
  res.status(status).json({ error: message });
}

function snapshotTariff(row: Record<string, unknown>) {
  return {
    reference: row.reference,
    name: row.name,
    duration_value: row.duration_value,
    duration_unit: row.duration_unit,
    price_fcfa: row.price_fcfa,
    is_active: row.is_active,
  };
}

function upsertTariff(id: string | null, body: Record<string, unknown>, user: AuthUser) {
  const reference = normalizeTariffRef(String(body.reference || ""));
  if (!isValidTariffRef(reference)) {
    throw Object.assign(new Error("La reference doit contenir 2 a 5 caracteres alphanumeriques"), { status: 400 });
  }
  const name = String(body.name || "").trim();
  const durationValue = Number(body.durationValue ?? body.duration_value);
  const durationUnit = String(body.durationUnit ?? body.duration_unit ?? "HOURS").toUpperCase();
  const priceFcfa = Number(body.priceFcfa ?? body.price_fcfa);
  const isActive = body.isActive === false || body.is_active === 0 ? 0 : 1;
  const reason = body.reason ? String(body.reason) : null;
  if (!name) throw Object.assign(new Error("Libelle obligatoire"), { status: 400 });
  if (!Number.isInteger(durationValue) || durationValue < 1) {
    throw Object.assign(new Error("Duree invalide"), { status: 400 });
  }
  if (durationUnit !== "HOURS" && durationUnit !== "WEEKS") {
    throw Object.assign(new Error("Unite de duree invalide (heures ou semaines)"), { status: 400 });
  }
  if (!Number.isInteger(priceFcfa) || priceFcfa < 0) {
    throw Object.assign(new Error("Prix invalide"), { status: 400 });
  }

  const db = getDb();
  const dup = db
    .prepare("SELECT id FROM tariffs WHERE reference = ? AND id != ?")
    .get(reference, id || "") as { id: string } | undefined;
  if (dup) throw Object.assign(new Error("Cette reference existe deja"), { status: 409 });

  const now = nowIso();
  if (!id) {
    const newId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO tariffs (id, reference, name, duration_value, duration_unit, price_fcfa, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId, reference, name, durationValue, durationUnit, priceFcfa, isActive, now, now);
    const created = db.prepare("SELECT * FROM tariffs WHERE id = ?").get(newId) as Record<string, unknown>;
    db.prepare(
      `INSERT INTO tariff_history (id, tariff_id, reference, name, duration_value, duration_unit, price_fcfa, is_active, changed_by, changed_at, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), newId, reference, name, durationValue, durationUnit, priceFcfa, isActive, user.id, now, reason);
    writeAudit({
      user,
      operation: "TARIFF_CREATE",
      entityType: "tariff",
      entityId: newId,
      newValue: snapshotTariff(created),
      reason,
    });
    return created;
  }

  const existing = db.prepare("SELECT * FROM tariffs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) throw Object.assign(new Error("Tarif introuvable"), { status: 404 });
  db.prepare(
    `UPDATE tariffs SET reference = ?, name = ?, duration_value = ?, duration_unit = ?, price_fcfa = ?, is_active = ?, updated_at = ? WHERE id = ?`,
  ).run(reference, name, durationValue, durationUnit, priceFcfa, isActive, now, id);
  db.prepare(
    `INSERT INTO tariff_history (id, tariff_id, reference, name, duration_value, duration_unit, price_fcfa, is_active, changed_by, changed_at, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), id, reference, name, durationValue, durationUnit, priceFcfa, isActive, user.id, now, reason);
  const updated = db.prepare("SELECT * FROM tariffs WHERE id = ?").get(id) as Record<string, unknown>;
  writeAudit({
    user,
    operation: existing.price_fcfa !== priceFcfa ? "TARIFF_PRICE_UPDATE" : "TARIFF_UPDATE",
    entityType: "tariff",
    entityId: id,
    oldValue: snapshotTariff(existing),
    newValue: snapshotTariff(updated),
    reason,
  });
  return updated;
}

function upsertUser(id: string | null, body: Record<string, unknown>, actor: AuthUser) {
  const username = String(body.username || "").trim();
  const displayName = String(body.displayName || body.display_name || "").trim();
  const role = String(body.role || "CASHIER").toUpperCase();
  const isActive = body.isActive === false || body.is_active === 0 ? 0 : 1;
  const password = body.password ? String(body.password) : "";
  if (!username || !displayName) throw Object.assign(new Error("Nom d'utilisateur et nom affiche obligatoires"), { status: 400 });
  if (role !== "CASHIER" && role !== "ADMIN") throw Object.assign(new Error("Role invalide"), { status: 400 });
  const db = getDb();
  const now = nowIso();
  if (!id) {
    if (password.length < 6) throw Object.assign(new Error("Mot de passe trop court (6 caracteres min.)"), { status: 400 });
    const newId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId, username, displayName, bcrypt.hashSync(password, 10), role, isActive, now, now);
    writeAudit({
      user: actor,
      operation: "USER_CREATE",
      entityType: "user",
      entityId: newId,
      newValue: { username, displayName, role, isActive },
    });
    return db.prepare("SELECT id, username, display_name, role, is_active, created_at FROM users WHERE id = ?").get(newId);
  }
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) throw Object.assign(new Error("Utilisateur introuvable"), { status: 404 });
  if (id === actor.id && isActive === 0) {
    throw Object.assign(new Error("Impossible de desactiver votre propre compte"), { status: 400 });
  }
  db.prepare("UPDATE users SET username = ?, display_name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?").run(
    username,
    displayName,
    role,
    isActive,
    now,
    id,
  );
  if (password) {
    if (password.length < 6) throw Object.assign(new Error("Mot de passe trop court"), { status: 400 });
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(password, 10), id);
  }
  writeAudit({
    user: actor,
    operation: isActive === 0 && existing.is_active ? "USER_DISABLE" : "USER_UPDATE",
    entityType: "user",
    entityId: id,
    oldValue: { username: existing.username, role: existing.role, isActive: existing.is_active },
    newValue: { username, displayName, role, isActive },
  });
  return db.prepare("SELECT id, username, display_name, role, is_active, created_at FROM users WHERE id = ?").get(id);
}
