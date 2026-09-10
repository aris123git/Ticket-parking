import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { nowIso } from "@parkflow/shared";
import { clearOwnerCookie, ownerRequired, setOwnerCookie, signOwner, type OwnerRequest } from "./auth.js";
import { getDb } from "./db.js";
import {
  authenticateInstallation,
  claimInstallation,
  getOwnedInstallation,
  ingestSync,
  ownerInstallations,
  publicInstallation,
  statsForInstallations,
  upsertInstallation,
} from "./installations.js";

export function createCloudApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use(
    cors({
      origin: [/^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/localhost:\d+$/],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "8mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, role: "cloud-supervision" }));

  app.post("/api/auth/register", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const displayName = String(req.body?.displayName || "").trim();
    if (!email || !displayName || password.length < 6) {
      res.status(400).json({ error: "Email, nom et mot de passe (6+ caracteres) requis" });
      return;
    }
    try {
      const id = crypto.randomUUID();
      getDb()
        .prepare("INSERT INTO owners (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(id, email, displayName, bcrypt.hashSync(password, 10), nowIso());
      const owner = { id, email, displayName };
      const token = signOwner(owner);
      setOwnerCookie(res, token);
      res.status(201).json({ owner, token });
    } catch {
      res.status(409).json({ error: "Un compte existe deja avec cet email" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const row = getDb().prepare("SELECT * FROM owners WHERE email = ?").get(email) as Record<string, unknown> | undefined;
    if (!row || !bcrypt.compareSync(password, String(row.password_hash))) {
      res.status(401).json({ error: "Email ou mot de passe incorrect" });
      return;
    }
    const owner = { id: String(row.id), email: String(row.email), displayName: String(row.display_name) };
    const token = signOwner(owner);
    setOwnerCookie(res, token);
    res.json({ owner, token });
  });

  app.post("/api/auth/logout", (_req, res) => {
    clearOwnerCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", ownerRequired, (req: OwnerRequest, res) => {
    res.json({ owner: req.owner });
  });

  app.post("/api/v1/sync", (req, res) => {
    try {
      const installationId = String(req.header("X-Installation-Id") || req.body?.installationId || "");
      const apiKey = String(req.header("X-Api-Key") || req.body?.apiKey || "");
      const pairingCode = String(req.body?.pairingCode || "");
      if (!installationId || !apiKey) {
        res.status(401).json({ error: "Identifiants d'installation requis" });
        return;
      }
      let inst = authenticateInstallation(installationId, apiKey);
      if (!inst) {
        inst = upsertInstallation({
          installationId,
          apiKey,
          pairingCode,
          parking: req.body?.parking || {},
        });
      } else {
        inst = upsertInstallation({
          installationId,
          apiKey,
          pairingCode: pairingCode || String(inst.pairing_code),
          parking: req.body?.parking || {},
        });
      }
      const result = ingestSync(inst, req.body || {});
      res.json({ ok: true, ...result });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      res.status(status).json({ error: err instanceof Error ? err.message : "Sync impossible" });
    }
  });

  app.get("/api/parkings", ownerRequired, (req: OwnerRequest, res) => {
    const period = String(req.query.period || "today") as "today" | "yesterday" | "week" | "month" | "custom";
    const list = ownerInstallations(req.owner!.id);
    const stats = statsForInstallations(
      list.map((i) => String(i.id)),
      period,
      String(req.query.from || ""),
      String(req.query.to || ""),
    );
    const parkings = list.map((i) => {
      const s = stats.parkings.find((p) => p.id === i.id) || { revenue: 0, tickets: 0 };
      return {
        id: i.id,
        name: i.name,
        address: i.address,
        phone: i.phone,
        lastSeenAt: i.last_seen_at,
        claimedAt: i.claimed_at,
        revenue: s.revenue,
        tickets: s.tickets,
      };
    });
    res.json({
      parkings,
      totalRevenue: stats.revenue,
      totalTickets: stats.ticketsSold,
      range: stats.range,
    });
  });

  app.post("/api/parkings/claim", ownerRequired, (req: OwnerRequest, res) => {
    try {
      const inst = claimInstallation(req.owner!.id, String(req.body?.pairingCode || ""));
      res.json({ parking: publicInstallation(inst as Record<string, unknown>) });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      res.status(status).json({ error: err instanceof Error ? err.message : "Association impossible" });
    }
  });

  app.get("/api/parkings/:id", ownerRequired, (req: OwnerRequest, res) => {
    const inst = getOwnedInstallation(req.owner!.id, req.params.id);
    if (!inst) {
      res.status(404).json({ error: "Parking introuvable" });
      return;
    }
    const period = String(req.query.period || "today") as "today" | "yesterday" | "week" | "month" | "custom";
    const stats = statsForInstallations([String(inst.id)], period, String(req.query.from || ""), String(req.query.to || ""));
    const tariffs = getDb().prepare("SELECT * FROM tariffs WHERE installation_id = ? ORDER BY price_fcfa").all(inst.id);
    const cashiers = getDb().prepare("SELECT * FROM cashiers WHERE installation_id = ?").all(inst.id);
    const audit = getDb()
      .prepare("SELECT * FROM audit_events WHERE installation_id = ? ORDER BY created_at DESC LIMIT 150")
      .all(inst.id);
    const closures = getDb()
      .prepare("SELECT * FROM cash_closures WHERE installation_id = ? ORDER BY closed_at DESC LIMIT 50")
      .all(inst.id);
    res.json({ parking: publicInstallation(inst), stats, tariffs, cashiers, audit, closures });
  });

  return app;
}
