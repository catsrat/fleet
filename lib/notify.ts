import { db } from "./db";
import type { Locale } from "./documents";

type Bilingual = { en: string; de: string };

/** Notifications store both languages so the rider sees them in whichever language they switch to. */
export async function notify(
  userId: string,
  n: { kind?: "INFO" | "SUCCESS" | "ACTION"; title: Bilingual; body: Bilingual },
): Promise<void> {
  await db.notification.create({
    data: { userId, kind: n.kind ?? "INFO", title: JSON.stringify(n.title), body: JSON.stringify(n.body) },
  });
}

export function pick(stored: string, locale: Locale): string {
  try {
    const parsed = JSON.parse(stored) as Partial<Bilingual>;
    return parsed[locale] ?? parsed.en ?? stored;
  } catch {
    return stored;
  }
}
