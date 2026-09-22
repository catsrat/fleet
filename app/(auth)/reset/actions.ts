"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Locale } from "@/lib/documents";
import { appUrl, passwordResetEmail, sendEmail } from "@/lib/email";
import { getLocale, tr } from "@/lib/locale";
import { hashPassword } from "@/lib/passwords";
import { RESET_TTL_MINUTES, findUsableToken, issueResetToken } from "@/lib/password-reset";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isStaffRole } from "@/lib/roles";
import { destroySession } from "@/lib/session";
import { validatePassword, validateStaffPassword } from "@/lib/validators";

/**
 * Step 1. Always reports success: telling a stranger whether an address has an account would leak
 * who rides for us. Rate limited per address and per network.
 */
export async function requestReset(fd: FormData): Promise<FormState> {
  const locale = await getLocale();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const done: FormState = {
    ok: true,
    message: tr(
      locale,
      "If that address has an account, a reset link is on its way. It lasts one hour.",
      "Falls es zu dieser Adresse ein Konto gibt, ist ein Link unterwegs. Er gilt eine Stunde.",
    ),
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: tr(locale, "Enter a valid email address.", "Bitte gib eine gültige E-Mail-Adresse ein.") };
  }
  const ip = await clientIp();
  if (!(await rateLimit(`reset-ip:${ip}`, 20, 60 * 60_000)).ok) return done;
  if (!(await rateLimit(`reset:${email}`, 5, 60 * 60_000)).ok) return done;

  const user = await db.user.findUnique({ where: { email } });
  // Accounts that sign in with Google have no password to reset.
  if (user?.active && !user.googleSub) {
    const token = await issueResetToken(user.id);
    const userLocale: Locale = user.locale === "de" ? "de" : "en";
    await sendEmail({ to: user.email, ...passwordResetEmail(userLocale, appUrl(`/reset?token=${token}`), RESET_TTL_MINUTES) });
    await audit({ actor: null, action: "PASSWORD_RESET_REQUESTED", entityType: "User", entityId: user.id, meta: { ip } });
  }
  return done;
}

/** Step 2. Consumes the token and sets the new password. */
export async function completeReset(fd: FormData): Promise<FormState> {
  const locale = await getLocale();
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");

  if (!(await rateLimit(`reset-use:${await clientIp()}`, 20, 60 * 60_000)).ok) {
    return { error: tr(locale, "Too many attempts. Try again later.", "Zu viele Versuche. Bitte später erneut versuchen.") };
  }

  const found = await findUsableToken(token);
  if (!found) {
    return { error: tr(locale, "That link has expired or was already used. Please request a new one.", "Dieser Link ist abgelaufen oder wurde bereits benutzt. Bitte fordere einen neuen an.") };
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: found.userId } });
  const problem = isStaffRole(user.role) ? validateStaffPassword(password) : validatePassword(password);
  if (problem) return { error: problem };
  if (password !== String(fd.get("confirm") ?? "")) {
    return { error: tr(locale, "The two passwords do not match.", "Die beiden Passwörter stimmen nicht überein.") };
  }

  // Marking the token used and changing the password together: a retry of the same link cannot succeed.
  await db.$transaction([
    db.passwordResetToken.update({ where: { id: found.id }, data: { usedAt: new Date() } }),
    db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: false } }),
  ]);
  await audit({ actor: { id: user.id, name: user.name }, action: "PASSWORD_RESET_COMPLETED", entityType: "User", entityId: user.id });

  // Any session that was open before the reset should not survive it.
  await destroySession();
  redirect(isStaffRole(user.role) ? "/staff/login?reset=1" : "/login?reset=1");
}
