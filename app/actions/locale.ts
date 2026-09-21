"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { LOCALE_COOKIE } from "@/lib/locale";
import { getSessionUser } from "@/lib/session";

export async function setLocale(formData: FormData): Promise<void> {
  const locale = formData.get("locale") === "de" ? "de" : "en";
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  const user = await getSessionUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale } });
  revalidatePath("/", "layout");
}
