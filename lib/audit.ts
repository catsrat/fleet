import { db } from "./db";

interface AuditInput {
  actor?: { id: string; name: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  riderId?: string | null;
  meta?: Record<string, unknown>;
}

export async function audit(a: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: a.actor?.id ?? null,
      actorName: a.actor?.name ?? null,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      riderId: a.riderId ?? null,
      meta: a.meta ? JSON.stringify(a.meta) : null,
    },
  });
}
