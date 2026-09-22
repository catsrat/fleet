import { COMPANY } from "./constants";
import type { Locale } from "./documents";
import { reportError } from "./report";

// Transactional email through Resend's REST API (no SDK, so nothing extra to install or keep updated).
// Without RESEND_API_KEY the app still works: messages are logged instead of sent, and every caller
// treats delivery as best-effort, so a mail outage can never break a review decision or a sign-up.

export interface EmailMessage {
  to: string;
  subject: string;
  heading: string;
  /** Paragraphs of body text. */
  lines: string[];
  action?: { label: string; url: string };
  footnote?: string;
}

export const emailConfigured = (): boolean => !!process.env.RESEND_API_KEY?.trim();

function sender(): string {
  const from = process.env.EMAIL_FROM?.trim();
  return from || `${COMPANY.name} <onboarding@resend.dev>`;
}

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function renderHtml(m: EmailMessage): string {
  const body = m.lines.map((l) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(l)}</p>`).join("");
  const button = m.action
    ? `<p style="margin:28px 0 8px"><a href="${encodeURI(m.action.url)}" style="display:inline-block;background:#0b8a7e;color:#fff;font-weight:600;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:8px">${escapeHtml(m.action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;color:#94a3b8;word-break:break-all">${escapeHtml(m.action.url)}</p>`
    : "";
  const footnote = m.footnote ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#64748b">${escapeHtml(m.footnote)}</p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f6f8fa;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;border:1px solid #e2e8f0"><tr><td style="padding:28px">
    <p style="margin:0 0 22px;font-size:17px;font-weight:700;color:#0b1220">${escapeHtml(COMPANY.name)}</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:#0b1220">${escapeHtml(m.heading)}</h1>
    ${body}${button}${footnote}
    <p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
      ${escapeHtml(COMPANY.legalName)} · <a href="mailto:${COMPANY.supportEmail}" style="color:#0b8a7e">${COMPANY.supportEmail}</a>
    </p>
  </td></tr></table></body></html>`;
}

const renderText = (m: EmailMessage): string =>
  [m.heading, "", ...m.lines, m.action ? `\n${m.action.label}: ${m.action.url}` : "", m.footnote ? `\n${m.footnote}` : "", `\n— ${COMPANY.legalName} · ${COMPANY.supportEmail}`]
    .filter((p) => p !== "")
    .join("\n");

/** Never throws: delivery problems are logged, so they cannot roll back the action that triggered them. */
export async function sendEmail(m: EmailMessage): Promise<{ sent: boolean; reason?: string }> {
  if (!emailConfigured()) {
    console.info(`[email] not configured; would send "${m.subject}" to ${m.to}`);
    return { sent: false, reason: "not-configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender(), to: [m.to], subject: m.subject, html: renderHtml(m), text: renderText(m) }),
      cache: "no-store",
    });
    if (!res.ok) {
      reportError(new Error(`Resend returned ${res.status}: ${(await res.text()).slice(0, 200)}`), { where: "email/send", extra: { subject: m.subject } });
      return { sent: false, reason: `http-${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    reportError(err, { where: "email/send", extra: { subject: m.subject } });
    return { sent: false, reason: "exception" };
  }
}

type Copy = { subject: string; heading: string; lines: string[]; action?: { label: string; url: string }; footnote?: string };

export const EMAIL_COPY: Record<Locale, { signIn: string; openApplication: string; ignore: string }> = {
  en: {
    signIn: "Open your account",
    openApplication: "Open your application",
    ignore: "If you did not expect this email you can ignore it.",
  },
  de: {
    signIn: "Konto öffnen",
    openApplication: "Bewerbung öffnen",
    ignore: "Wenn du diese E-Mail nicht erwartet hast, kannst du sie ignorieren.",
  },
};

/** Wraps an in-app notification as an email, so riders hear about it without logging in. */
export function notificationEmail(locale: Locale, title: string, body: string, path = "/apply"): Copy {
  return {
    subject: title,
    heading: title,
    lines: [body],
    action: { label: EMAIL_COPY[locale].openApplication, url: appUrl(path) },
  };
}

export function passwordResetEmail(locale: Locale, url: string, minutes: number): Copy {
  return locale === "de"
    ? {
        subject: "Passwort zurücksetzen",
        heading: "Passwort zurücksetzen",
        lines: [`Du kannst jetzt ein neues Passwort festlegen. Der Link gilt ${minutes} Minuten und funktioniert nur einmal.`],
        action: { label: "Neues Passwort festlegen", url },
        footnote: "Wenn du das nicht angefordert hast, ignoriere diese E-Mail – dein Passwort bleibt unverändert.",
      }
    : {
        subject: "Reset your password",
        heading: "Reset your password",
        lines: [`You can now choose a new password. This link lasts ${minutes} minutes and works only once.`],
        action: { label: "Choose a new password", url },
        footnote: "If you did not ask for this, ignore this email — your password stays as it is.",
      };
}
