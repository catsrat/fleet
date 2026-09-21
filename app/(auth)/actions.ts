"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getLocale, tr } from "@/lib/locale";
import { checkPassword, hashPassword } from "@/lib/passwords";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { createSession, destroySession } from "@/lib/session";
import { validatePassword } from "@/lib/validators";
import type { FormState } from "@/components/ActionForm";

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().max(200),
});

/** Rider sign-in. Staff have their own entrance at /staff/login and cannot use this one. */
export async function login(fd: FormData): Promise<FormState> {
  const locale = await getLocale();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");

  const key = `login:${await clientIp()}:${email}`;
  const limit = await rateLimit(key, 5, 15 * 60_000);
  if (!limit.ok) {
    const mins = Math.ceil(limit.retryAfterSec / 60);
    return { error: tr(locale, `Too many attempts. Try again in ${mins} min.`, `Zu viele Versuche. Bitte in ${mins} Min. erneut versuchen.`) };
  }

  const user = await db.user.findUnique({ where: { email } });
  const valid = await checkPassword(password, user?.passwordHash);
  if (!user || !valid || !user.active || user.role !== "RIDER") {
    return { error: tr(locale, "Invalid email or password.", "E-Mail oder Passwort ist falsch.") };
  }

  await resetRateLimit(key);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id, user.role);
  redirect("/apply");
}

export async function register(fd: FormData): Promise<FormState> {
  const locale = await getLocale();
  const parsed = registerSchema.safeParse({
    firstName: fd.get("firstName"),
    lastName: fd.get("lastName"),
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (!parsed.success) {
    return { error: tr(locale, "Please fill in all fields with a valid email address.", "Bitte fülle alle Felder mit einer gültigen E-Mail-Adresse aus.") };
  }
  const { firstName, lastName, email, password } = parsed.data;

  const pwError = validatePassword(password);
  if (pwError) return { error: tr(locale, pwError, "Das Passwort muss mindestens 10 Zeichen lang sein und Buchstaben sowie Zahlen enthalten.") };

  const limit = await rateLimit(`register:${await clientIp()}`, 10, 60 * 60_000);
  if (!limit.ok) return { error: tr(locale, "Too many sign-ups from this network. Try again later.", "Zu viele Registrierungen aus diesem Netzwerk. Bitte später erneut versuchen.") };

  if (await db.user.findUnique({ where: { email } })) {
    return { error: tr(locale, "An account with this email already exists. Try logging in.", "Mit dieser E-Mail existiert bereits ein Konto. Bitte melde dich an.") };
  }

  const user = await db.user.create({
    data: {
      email,
      name: `${firstName} ${lastName}`,
      role: "RIDER",
      locale,
      passwordHash: await hashPassword(password),
      rider: { create: { firstName, lastName } },
    },
    include: { rider: true },
  });
  await audit({
    actor: { id: user.id, name: user.name },
    action: "RIDER_REGISTERED",
    entityType: "Rider",
    entityId: user.rider!.id,
    riderId: user.rider!.id,
  });
  await createSession(user.id, user.role);
  redirect("/apply");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}
