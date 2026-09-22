import { audit } from "./audit";
import { db } from "./db";
import { purgeExpiredResetTokens } from "./password-reset";
import { deleteFile } from "./storage";

/**
 * Data minimisation (DSGVO Art. 5(1)(e)): personal data may only be kept as long as it is needed.
 *
 * Applicants we did not hire have their uploaded files erased after a waiting period, while the metadata
 * row (type, dates, who decided) stays as proof the decision was handled properly. Riders who actually
 * worked are never touched here: residence-permit copies must be kept for the duration of employment
 * (§ 4a AufenthG) and payroll records for the statutory periods.
 */
export const APPLICANT_RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 180);
const CLOSED_STATUSES = ["REJECTED", "OFFBOARDED"];
const NOTIFICATION_RETENTION_DAYS = 365;

export interface RetentionResult {
  ridersProcessed: number;
  filesDeleted: number;
  notificationsDeleted: number;
  resetTokensDeleted: number;
  cutoff: string;
}

export async function runRetention(now = new Date()): Promise<RetentionResult> {
  const cutoff = new Date(now.getTime() - APPLICANT_RETENTION_DAYS * 86_400_000);

  const riders = await db.rider.findMany({
    where: {
      status: { in: CLOSED_STATUSES },
      activatedAt: null, // never started work, so no employment retention duty
      updatedAt: { lt: cutoff },
      documents: { some: { storageKey: { not: "" } } },
    },
    select: { id: true, documents: { where: { storageKey: { not: "" } }, select: { id: true, storageKey: true } } },
    take: 200,
  });

  let filesDeleted = 0;
  for (const rider of riders) {
    for (const doc of rider.documents) {
      await deleteFile(doc.storageKey);
      await db.document.update({ where: { id: doc.id }, data: { storageKey: "" } });
      filesDeleted++;
    }
    await audit({
      actor: null,
      action: "RETENTION_DOCUMENTS_ERASED",
      entityType: "Rider",
      entityId: rider.id,
      riderId: rider.id,
      meta: { files: rider.documents.length, afterDays: APPLICANT_RETENTION_DAYS },
    });
  }

  const { count: notificationsDeleted } = await db.notification.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 86_400_000) } },
  });
  await db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
  const resetTokensDeleted = await purgeExpiredResetTokens();

  return { ridersProcessed: riders.length, filesDeleted, notificationsDeleted, resetTokensDeleted, cutoff: cutoff.toISOString().slice(0, 10) };
}
