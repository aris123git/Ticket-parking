import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { nowIso } from "@parkflow/shared";
import { getDb } from "./db.js";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "CASHIER" | "ADMIN";
  isActive: boolean;
};

const DEFAULT_TARIFFS = [
  { reference: "1H", name: "1 heure", durationValue: 1, durationUnit: "HOURS" as const, priceFcfa: 250 },
  { reference: "6H", name: "6 heures", durationValue: 6, durationUnit: "HOURS" as const, priceFcfa: 500 },
  { reference: "24H", name: "24 heures", durationValue: 24, durationUnit: "HOURS" as const, priceFcfa: 1000 },
  { reference: "1S", name: "1 semaine", durationValue: 1, durationUnit: "WEEKS" as const, priceFcfa: 5000 },
  { reference: "2S", name: "2 semaines", durationValue: 2, durationUnit: "WEEKS" as const, priceFcfa: 8000 },
];

function pairingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function allSettings(): Record<string, string> {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function seedIfNeeded(): void {
  const db = getDb();
  const userCount = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  if (userCount > 0) {
    ensureInstallationIdentity();
    return;
  }

  const now = nowIso();
  const adminId = crypto.randomUUID();
  const cashierId = crypto.randomUUID();
  const adminHash = bcrypt.hashSync("admin123", 10);
  const cashierHash = bcrypt.hashSync("caissier123", 10);

  const insertUser = db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  insertUser.run(adminId, "admin", "Administrateur", adminHash, "ADMIN", now, now);
  insertUser.run(cashierId, "caissier", "Aminata Ouedraogo", cashierHash, "CASHIER", now, now);

  const insertTariff = db.prepare(
    `INSERT INTO tariffs (id, reference, name, duration_value, duration_unit, price_fcfa, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  for (const t of DEFAULT_TARIFFS) {
    insertTariff.run(crypto.randomUUID(), t.reference, t.name, t.durationValue, t.durationUnit, t.priceFcfa, now, now);
  }

  setSetting("parking_name", "Parking Central");
  setSetting("parking_address", "Avenue de l'Independance, Ouagadougou");
  setSetting("parking_phone", "+226 70 00 00 00");
  setSetting("ticket_header", "TICKET DE STATIONNEMENT");
  setSetting("ticket_footer", "Merci et bonne route");
  setSetting("printer_width", "80");
  setSetting("printer_target", "preview");
  setSetting("printer_host", "127.0.0.1");
  setSetting("printer_port", "9100");
  setSetting("printer_path", "");
  setSetting("printer_alignment", "center");
  setSetting("printer_font_size", "1");
  setSetting("printer_show_address", "1");
  setSetting("printer_show_phone", "1");
  setSetting("printer_show_header", "1");
  setSetting("printer_show_footer", "1");
  setSetting("printer_show_cashier", "0");
  setSetting("cloud_url", process.env.CLOUD_URL || "http://127.0.0.1:3200");
  setSetting("timezone", "Africa/Ouagadougou");
  ensureInstallationIdentity();
}

export function ensureInstallationIdentity(): void {
  if (!getSetting("installation_id")) {
    setSetting("installation_id", `park_${crypto.randomBytes(24).toString("hex")}`);
  }
  if (!getSetting("api_key")) {
    setSetting("api_key", crypto.randomBytes(32).toString("hex"));
  }
  if (!getSetting("pairing_code")) {
    setSetting("pairing_code", pairingCode());
  }
}

export function regeneratePairingCode(): string {
  const code = pairingCode();
  setSetting("pairing_code", code);
  return code;
}

export function mapUser(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role: row.role as AuthUser["role"],
    isActive: Boolean(row.is_active),
  };
}
