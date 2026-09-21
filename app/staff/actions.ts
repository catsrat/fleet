"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { decryptField } from "@/lib/crypto";
import { db } from "@/lib/db";
import { checkPassword } from "@/lib/passwords";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { isStaffRole } from "@/lib/roles";
import { clearPendingLogin, createPendingLogin, createSession, readPendingLogin } from "@/lib/session";
import { twoFactorRequired } from "@/lib/staff-mfa";
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode, verifyTotp } from "@/lib/totp";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const GENERIC_ERROR = "Invalid ID or password.";

async function finishLogin(user: { id: string; name: string; role: string }): Promise<void> {
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await clearPendingLogin();
  await createSession(user.id, user.role);
  await audit({ actor: { id: user.id, name: user.name }, action: "STAFF_LOGIN", entityType: "User", entityId: user.id });
}

/** Step 1: ID (username or email) and password. A full session only exists after the second factor. */
export async function staffLogin(fd: FormData): Promise<FormState> {
  const identifier = text(fd, "identifier").toLowerCase();
  const password = String(fd.get("password") ?? "");

  const key = `slogin:${await clientIp()}:${identifier}`;
  const limit = rateLimit(key, 5, 15 * 60_000);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` };

  const user = identifier ? await db.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }] } }) : null;
  const valid = await checkPassword(password, user?.passwordHash);
  if (!user || !valid || !user.active || !isStaffRole(user.role)) {
    if (user && isStaffRole(user.role)) {
      await audit({ actor: null, action: "STAFF_LOGIN_FAILED", entityType: "User", entityId: user.id, meta: { ip: await clientIp() } });
    }
    return { error: GENERIC_ERROR };
  }

  resetRateLimit(key); // guessing is what this limiter stops; the second factor has its own limiter
  if (user.totpEnabledAt) {
    await createPendingLogin(user.id, "verify");
    redirect("/staff/login/verify");
  }
  if (twoFactorRequired()) {
    await createPendingLogin(user.id, "enroll");
    redirect("/staff/login/enroll");
  }
  await finishLogin(user);
  redirect("/admin");
}

/** Step 2: 6-digit authenticator code, or a one-time recovery code if the phone is lost. */
export async function staffVerify(fd: FormData): Promise<FormState> {
  const pending = await readPendingLogin();
  if (!pending || pending.stage !== "verify") redirect("/staff/login");
  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.active || !isStaffRole(user.role) || !user.totpEnabledAt) redirect("/staff/login");

  const limit = rateLimit(`mfa:${user.id}`, 5, 10 * 60_000);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` };

  const input = text(fd, "code");
  const secret = decryptField(user.totpSecretEnc);
  let ok = false;

  if (/^\s*\d[\d\s]{5,}$/.test(input) && secret) {
    const step = verifyTotp(secret, input, { lastStep: user.totpLastStep });
    if (step !== null) {
      await db.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
      ok = true;
    }
  } else if (normalizeRecoveryCode(input).length === 10) {
    const hashes: string[] = JSON.parse(user.recoveryCodes ?? "[]");
    const hash = hashRecoveryCode(input);
    if (hashes.includes(hash)) {
      const remaining = hashes.filter((h) => h !== hash);
      await db.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(remaining) } });
      await audit({ actor: { id: user.id, name: user.name }, action: "STAFF_RECOVERY_CODE_USED", entityType: "User", entityId: user.id, meta: { remaining: remaining.length } });
      ok = true;
    }
  }

  if (!ok) {
    await audit({ actor: null, action: "STAFF_MFA_FAILED", entityType: "User", entityId: user.id, meta: { ip: await clientIp() } });
    return { error: "That code is not valid. Check your authenticator app and try again." };
  }

  resetRateLimit(`mfa:${user.id}`);
  await finishLogin(user);
  redirect("/admin");
}

export type EnrollResult = FormState & { codes?: string[] };

/**
 * First sign-in, step 1: confirm the authenticator works and hand out recovery codes (shown once).
 * This deliberately touches no cookies: changing a cookie makes Next re-render the page, which would
 * navigate away before the codes could be displayed. The session is created by finishEnrollment.
 */
export async function confirmEnrollment(fd: FormData): Promise<EnrollResult> {
  const pending = await readPendingLogin();
  if (!pending || pending.stage !== "enroll") redirect("/staff/login");
  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.active || !isStaffRole(user.role) || user.totpEnabledAt) redirect("/staff/login");

  const limit = rateLimit(`mfa:${user.id}`, 5, 10 * 60_000);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` };

  const secret = decryptField(user.totpSecretEnc);
  const step = secret ? verifyTotp(secret, text(fd, "code")) : null;
  if (step === null) return { error: "That code is not valid. Make sure the app shows the account 'Nucleus Fleet' and try the next code." };

  const codes = generateRecoveryCodes(8);
  await db.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date(), totpLastStep: step, recoveryCodes: JSON.stringify(codes.map(hashRecoveryCode)) },
  });
  await audit({ actor: { id: user.id, name: user.name }, action: "STAFF_2FA_ENABLED", entityType: "User", entityId: user.id });
  resetRateLimit(`mfa:${user.id}`);
  return { ok: true, codes };
}

/** First sign-in, step 2: the person confirmed they saved their recovery codes, so open the session. */
export async function finishEnrollment(): Promise<void> {
  const pending = await readPendingLogin();
  if (!pending || pending.stage !== "enroll") redirect("/staff/login");
  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.active || !isStaffRole(user.role)) redirect("/staff/login");
  if (!user.totpEnabledAt) redirect("/staff/login/enroll"); // the authenticator was never confirmed
  await finishLogin(user);
  redirect("/admin");
}
