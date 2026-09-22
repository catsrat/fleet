import { db } from "./db";
import type { Locale } from "./documents";
import { notificationEmail, sendEmail } from "./email";

type Bilingual = { en: string; de: string };

export interface NotifyOptions {
  kind?: "INFO" | "SUCCESS" | "ACTION";
  title: Bilingual;
  body: Bilingual;
  /** Where the email's button should point. Defaults to the rider's application page. */
  path?: string;
  /** Set false for chatter that does not deserve an inbox message. */
  email?: boolean;
}

/**
 * Records an in-app notification and emails the same message. Notifications store both languages so the
 * rider sees them in whichever language they switch to; the email uses the language on their account.
 * Email delivery is best-effort — a mail failure never rolls back the action that caused it.
 */
export async function notify(userId: string, n: NotifyOptions): Promise<void> {
  await db.notification.create({
    data: { userId, kind: n.kind ?? "INFO", title: JSON.stringify(n.title), body: JSON.stringify(n.body) },
  });

  if (n.email === false) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, locale: true, active: true } });
  if (!user?.active) return;
  const locale: Locale = user.locale === "de" ? "de" : "en";
  await sendEmail({ to: user.email, ...notificationEmail(locale, n.title[locale], n.body[locale], n.path) });
}

export function pick(stored: string, locale: Locale): string {
  try {
    const parsed = JSON.parse(stored) as Partial<Bilingual>;
    return parsed[locale] ?? parsed.en ?? stored;
  } catch {
    return stored;
  }
}
