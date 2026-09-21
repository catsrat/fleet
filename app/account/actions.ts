"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { checkPassword, hashPassword } from "@/lib/passwords";
import { rateLimit } from "@/lib/rate-limit";
import { isStaffRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";
import { generateRecoveryCodes, hashRecoveryCode } from "@/lib/totp";
import { validatePassword, validateStaffPassword } from "@/lib/validators";

// These use getSessionUser (not requireUser) on purpose: someone with a temporary password must be able to reach them.
async function current() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function changePassword(fd: FormData): Promise<FormState> {
  const user = await current();
  const existing = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");

  if (!(await rateLimit(`pw:${user.id}`, 5, 15 * 60_000)).ok) return { error: "Too many attempts. Try again in a few minutes." };
  if (!(await checkPassword(existing, user.passwordHash))) return { error: "Your current password is incorrect." };
  const problem = isStaffRole(user.role) ? validateStaffPassword(next) : validatePassword(next);
  if (problem) return { error: problem };
  if (next === existing) return { error: "Choose a password you haven't used before." };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  await audit({ actor: { id: user.id, name: user.name }, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id });
  if (user.mustChangePassword) redirect(isStaffRole(user.role) ? "/admin" : "/apply");
  return { ok: true, message: "Password updated." };
}

export type CodesResult = FormState & { codes?: string[] };

/** Replaces all recovery codes. Requires the password so a hijacked session cannot mint fresh backdoors. */
export async function regenerateRecoveryCodes(fd: FormData): Promise<CodesResult> {
  const user = await current();
  if (!isStaffRole(user.role) || !user.totpEnabledAt) return { error: "Two-factor sign-in is not enabled." };
  if (!(await rateLimit(`pw:${user.id}`, 5, 15 * 60_000)).ok) return { error: "Too many attempts. Try again in a few minutes." };
  if (!(await checkPassword(String(fd.get("password") ?? ""), user.passwordHash))) return { error: "Your password is incorrect." };

  const codes = generateRecoveryCodes(8);
  await db.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(codes.map(hashRecoveryCode)) } });
  await audit({ actor: { id: user.id, name: user.name }, action: "STAFF_RECOVERY_CODES_REGENERATED", entityType: "User", entityId: user.id });
  return { ok: true, codes };
}
