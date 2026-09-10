import crypto from "node:crypto";
import { nowIso } from "@parkflow/shared";
import { getDb } from "./db.js";
import type { AuthUser } from "./seed.js";

export function writeAudit(params: {
  user: AuthUser | { id?: string; displayName: string; role: string };
  operation: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (
        id, user_id, user_name, user_role, operation, entity_type, entity_id,
        old_value, new_value, reason, created_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    )
    .run(
      crypto.randomUUID(),
      params.user.id ?? null,
      params.user.displayName,
      params.user.role,
      params.operation,
      params.entityType,
      params.entityId ?? null,
      params.oldValue == null ? null : JSON.stringify(params.oldValue),
      params.newValue == null ? null : JSON.stringify(params.newValue),
      params.reason ?? null,
      nowIso(),
    );
}
