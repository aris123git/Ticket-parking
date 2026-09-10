import crypto from "node:crypto";
import { nowIso } from "@parkflow/shared";
import { getDb } from "./db.js";
import { allSettings, getSetting } from "./seed.js";
import { pendingSyncCounts } from "./stats.js";

export type SyncState = {
  online: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  pending: ReturnType<typeof pendingSyncCounts>;
};

let state: SyncState = {
  online: false,
  lastSuccessAt: null,
  lastError: null,
  pending: { sales: 0, audit: 0, closures: 0, total: 0 },
};

let timer: NodeJS.Timeout | null = null;
let running = false;
let delayMs = 8000;

export function getSyncState(): SyncState {
  return { ...state, pending: pendingSyncCounts() };
}

export function startSyncLoop(): void {
  if (timer) return;
  const tick = async () => {
    await runSyncOnce();
    timer = setTimeout(tick, delayMs);
  };
  timer = setTimeout(tick, 1500);
}

export function stopSyncLoop(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

export async function runSyncOnce(): Promise<SyncState> {
  if (running) return getSyncState();
  running = true;
  const db = getDb();
  try {
    const cloudUrl = (getSetting("cloud_url") || "http://127.0.0.1:3200").replace(/\/$/, "");
    const installationId = getSetting("installation_id");
    const apiKey = getSetting("api_key");
    const pairingCode = getSetting("pairing_code");
    if (!installationId || !apiKey) throw new Error("Identite d'installation manquante");

    const sales = db.prepare("SELECT * FROM sales WHERE sync_status != 'SYNCED' LIMIT 200").all();
    const audit = db.prepare("SELECT * FROM audit_log WHERE sync_status != 'SYNCED' LIMIT 200").all();
    const closures = db.prepare("SELECT * FROM cash_closures WHERE sync_status != 'SYNCED' LIMIT 50").all();
    const tariffs = db.prepare("SELECT * FROM tariffs").all();
    const cashiers = db
      .prepare("SELECT id, username, display_name, role, is_active FROM users")
      .all();
    const settings = allSettings();

    const payload = {
      installationId,
      pairingCode,
      parking: {
        name: settings.parking_name,
        address: settings.parking_address,
        phone: settings.parking_phone,
      },
      sales,
      audit,
      closures,
      tariffs,
      cashiers,
    };

    const res = await fetch(`${cloudUrl}/api/v1/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Installation-Id": installationId,
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const result = (await res.json()) as {
      claimed?: boolean;
      saleIds?: string[];
      auditIds?: string[];
      closureIds?: string[];
    };

    const mark = db.prepare("UPDATE sales SET sync_status = 'SYNCED', last_sync_at = ?, sync_error = NULL WHERE id = ?");
    const markAudit = db.prepare("UPDATE audit_log SET sync_status = 'SYNCED' WHERE id = ?");
    const markClosure = db.prepare("UPDATE cash_closures SET sync_status = 'SYNCED' WHERE id = ?");
    const now = nowIso();
    db.transaction(() => {
      for (const id of result.saleIds || sales.map((s: { id: string }) => s.id)) mark.run(now, id);
      for (const id of result.auditIds || audit.map((s: { id: string }) => s.id)) markAudit.run(id);
      for (const id of result.closureIds || closures.map((s: { id: string }) => s.id)) markClosure.run(id);
    })();

    state = {
      online: true,
      lastSuccessAt: now,
      lastError: null,
      pending: pendingSyncCounts(),
    };
    delayMs = 8000;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE sales SET sync_attempts = sync_attempts + 1, sync_error = ?, sync_status = 'PENDING'
       WHERE sync_status != 'SYNCED'`,
    ).run(error.slice(0, 300));
    state = {
      online: false,
      lastSuccessAt: state.lastSuccessAt,
      lastError: error,
      pending: pendingSyncCounts(),
    };
    delayMs = Math.min(delayMs * 2, 5 * 60 * 1000);
  } finally {
    running = false;
  }
  return getSyncState();
}

export function installationPublic() {
  const s = allSettings();
  return {
    installationId: s.installation_id,
    pairingCode: s.pairing_code,
    cloudUrl: s.cloud_url,
    parkingName: s.parking_name,
    fingerprint: crypto.createHash("sha256").update(s.installation_id || "").digest("hex").slice(0, 12),
  };
}
