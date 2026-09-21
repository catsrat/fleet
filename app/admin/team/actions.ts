"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { hashPassword, temporaryPassword } from "@/lib/passwords";
import { isStaffRole } from "@/lib/roles";
import { requireOwner } from "@/lib/session";
import { validateUsername } from "@/lib/validators";

/** The owner is created only from the command line and can never be modified from the web. */
async function staffTarget(id: string) {
  const target = await db.user.findUnique({ where: { id } });
  return target && isStaffRole(target.role) && target.role !== "OWNER" ? target : null;
}

export async function createStaff(fd: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email().max(200),
      username: z.string().trim().toLowerCase(),
      role: z.enum(["REVIEWER", "ADMIN"]),
    })
    .safeParse({ name: fd.get("name"), email: fd.get("email"), username: fd.get("username"), role: fd.get("role") });
  if (!parsed.success) return { error: "Enter a name, a valid email, an ID and a role." };
  const idError = validateUsername(parsed.data.username);
  if (idError) return { error: idError };
  if (await db.user.findFirst({ where: { OR: [{ email: parsed.data.email }, { username: parsed.data.username }] } })) {
    return { error: "That email or ID is already in use." };
  }

  const password = temporaryPassword();
  const user = await db.user.create({
    data: { ...parsed.data, passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await audit({ actor: { id: owner.id, name: owner.name }, action: "STAFF_CREATED", entityType: "User", entityId: user.id, meta: { role: parsed.data.role } });
  revalidatePath("/admin/team");
  return { ok: true, message: `Created. Temporary password (shown once): ${password} — they must change it and set up two-factor at first sign-in.` };
}

export async function setUserActive(fd: FormData): Promise<void> {
  const owner = await requireOwner();
  const target = await staffTarget(String(fd.get("userId") ?? ""));
  if (!target) return;
  const active = fd.get("active") === "1";
  await db.user.update({ where: { id: target.id }, data: { active } });
  await audit({ actor: { id: owner.id, name: owner.name }, action: active ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED", entityType: "User", entityId: target.id });
  revalidatePath("/admin/team");
}

export async function resetStaffPassword(fd: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const target = await staffTarget(String(fd.get("userId") ?? ""));
  if (!target) return { error: "Account not found." };
  const password = temporaryPassword();
  await db.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } });
  await audit({ actor: { id: owner.id, name: owner.name }, action: "STAFF_PASSWORD_RESET", entityType: "User", entityId: target.id });
  return { ok: true, message: `New temporary password (shown once): ${password}` };
}

/** For a lost phone: clears the authenticator so the person enrolls a new one at their next sign-in. */
export async function resetStaffMfa(fd: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const target = await staffTarget(String(fd.get("userId") ?? ""));
  if (!target) return { error: "Account not found." };
  await db.user.update({ where: { id: target.id }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: null } });
  await audit({ actor: { id: owner.id, name: owner.name }, action: "STAFF_2FA_RESET", entityType: "User", entityId: target.id });
  revalidatePath("/admin/team");
  return { ok: true, message: "Two-factor cleared. They will set it up again at next sign-in." };
}
