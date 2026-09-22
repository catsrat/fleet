import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

export const RESET_TTL_MINUTES = 60;

export const hashResetToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/**
 * Issues a single-use reset token. Only its hash is stored. Any earlier unused tokens for the account are
 * invalidated, so a forwarded old email cannot be used after a newer request.
 */
export async function issueResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordResetToken.create({
      data: { userId, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) },
    }),
  ]);
  return token;
}

export interface ResetLookup {
  id: string;
  userId: string;
}

/** Returns the token record only when it exists, is unused, unexpired, and its account is usable. */
export async function findUsableToken(token: string): Promise<ResetLookup | null> {
  if (!token || token.length < 20) return null;
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    include: { user: { select: { active: true, googleSub: true } } },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date()) return null;
  if (!row.user.active) return null;
  return { id: row.id, userId: row.userId };
}

/** Housekeeping so the table does not grow without bound. */
export async function purgeExpiredResetTokens(): Promise<number> {
  const { count } = await db.passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] },
  });
  return count;
}
