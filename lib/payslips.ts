import type { Locale } from "./documents";

// A German employer issues payslips (Lohnabrechnung); a fleet that pays self-employed couriers issues
// earnings statements (Abrechnung/Gutschrift). Both live here, plus the yearly certificate.
export const PAYSLIP_KINDS = ["PAYSLIP", "STATEMENT", "ANNUAL"] as const;
export type PayslipKind = (typeof PAYSLIP_KINDS)[number];

export const KIND_LABEL: Record<PayslipKind, Record<Locale, string>> = {
  PAYSLIP: { en: "Payslip", de: "Lohnabrechnung" },
  STATEMENT: { en: "Earnings statement", de: "Abrechnung" },
  ANNUAL: { en: "Annual certificate", de: "Jahresbescheinigung" },
};

export const MAX_PAYSLIP_BYTES = 5 * 1024 * 1024;

export function periodLabel(kind: string, year: number, month: number, locale: Locale): string {
  if (kind === "ANNUAL" || month === 0) return String(year);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const isPayslipKind = (k: string): k is PayslipKind => (PAYSLIP_KINDS as readonly string[]).includes(k);

/** Documents for the current month or earlier only; a payslip cannot exist for a period that has not ended being worked. */
export function validPeriod(kind: PayslipKind, year: number, month: number, now = new Date()): boolean {
  if (!Number.isInteger(year) || year < 2020 || year > now.getUTCFullYear()) return false;
  if (kind === "ANNUAL") return month === 0;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  return year < now.getUTCFullYear() || month <= now.getUTCMonth() + 1;
}
