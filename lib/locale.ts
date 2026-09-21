import { cookies } from "next/headers";
import type { Locale } from "./documents";

export const LOCALE_COOKIE = "nf_locale";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return v === "de" ? "de" : "en";
}

/** Picks the message for the rider's language: tr(locale, "English", "Deutsch"). */
export const tr = (locale: Locale, en: string, de: string): string => (locale === "de" ? de : en);
