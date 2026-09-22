"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { STAFF_ROLES, ownerExists } from "@/lib/setup";
import { validateStaffPassword, validateUsername } from "@/lib/validators";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Creates the single OWNER account from the browser. Three independent gates:
 *   1. a SETUP_TOKEN must be configured on the deployment (absent = setup disabled),
 *   2. the caller must know it,
 *   3. no staff account may exist yet — so this can only ever run once.
 */
export async function createOwner(fd: FormData): Promise<FormState> {
  const expected = process.env.SETUP_TOKEN?.trim();
  if (!expected) return { error: "Setup is disabled on this deployment." };

  const limit = await rateLimit(`setup:${await clientIp()}`, 10, 60 * 60_000);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` };

  if (await ownerExists()) return { error: "An administrator account already exists. Sign in instead." };
  if (!tokenMatches(text(fd, "token"), expected)) return { error: "That setup code is not correct." };

  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      username: z.string().trim().toLowerCase(),
      email: z.string().trim().toLowerCase().email().max(200),
    })
    .safeParse({ name: fd.get("name"), username: fd.get("username"), email: fd.get("email") });
  if (!parsed.success) return { error: "Enter your name, a sign-in ID and a valid email address." };

  const idError = validateUsername(parsed.data.username);
  if (idError) return { error: idError };

  const password = String(fd.get("password") ?? "");
  const passwordError = validateStaffPassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords do not match." };

  if (await db.user.findFirst({ where: { OR: [{ email: parsed.data.email }, { username: parsed.data.username }] } })) {
    return { error: "That email or ID is already in use." };
  }

  // Re-check inside the write: two people submitting at once must not both become owner.
  const owner = await db.$transaction(async (tx) => {
    if ((await tx.user.count({ where: { role: { in: [...STAFF_ROLES] } } })) > 0) return null;
    return tx.user.create({
      data: { ...parsed.data, passwordHash: await hashPassword(password), role: "OWNER", emailVerifiedAt: new Date() },
    });
  });
  if (!owner) return { error: "An administrator account already exists. Sign in instead." };

  await audit({ actor: { id: owner.id, name: owner.name }, action: "OWNER_CREATED", entityType: "User", entityId: owner.id, meta: { via: "web-setup" } });
  redirect("/staff/login?created=1");
}
