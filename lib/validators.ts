import { MIN_RIDER_AGE } from "./constants";

const digitsOnly = (s: string) => s.replace(/[\s.-]/g, "");

/** IBAN structure + ISO 13616 mod-97 check. Accepts any country. */
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function isValidIban(input: string): boolean {
  const iban = normalizeIban(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("DE") && iban.length !== 22) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of value) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/**
 * German tax ID (steuerliche Identifikationsnummer): 11 digits, first digit not 0,
 * one digit repeated 2-3 times in the first ten (never three in a row), ISO 7064 MOD 11,10 check digit.
 */
export function isValidSteuerId(input: string): boolean {
  const s = digitsOnly(input);
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const first10 = s.slice(0, 10);
  const counts = new Map<string, number>();
  for (const d of first10) counts.set(d, (counts.get(d) ?? 0) + 1);
  const repeated = [...counts.values()].filter((c) => c > 1);
  if (repeated.length !== 1 || repeated[0] > 3) return false;
  if (/(\d)\1\1/.test(first10)) return false;
  let product = 10;
  for (let i = 0; i < 10; i++) {
    let sum = (Number(s[i]) + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  let check = 11 - product;
  if (check === 10) check = 0;
  return check === Number(s[10]);
}

/**
 * German social security / pension insurance number (Rentenversicherungsnummer):
 * AA DDMMYY L NN P — area(2) birth date(6) first letter of birth name(1) serial(2) check digit(1).
 */
export function isValidSvNumber(input: string): boolean {
  const s = input.replace(/\s+/g, "").toUpperCase();
  if (!/^\d{8}[A-Z]\d{3}$/.test(s)) return false;
  const letter = String(s.charCodeAt(8) - 64).padStart(2, "0");
  const digits = s.slice(0, 8) + letter + s.slice(9, 11);
  const weights = [2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1];
  let total = 0;
  for (let i = 0; i < 12; i++) {
    const product = Number(digits[i]) * weights[i];
    total += Math.floor(product / 10) + (product % 10);
  }
  return total % 10 === Number(s[11]);
}

export function ageOn(dob: Date, today = new Date()): number {
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export function isAdult(dob: Date): boolean {
  return ageOn(dob) >= MIN_RIDER_AGE;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Password must contain letters and numbers.";
  return null;
}

/** Staff can see identity documents and payroll data, so their bar is higher than for riders. */
export function validateStaffPassword(pw: string): string | null {
  if (pw.length < 12) return "Staff passwords must be at least 12 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Password must contain letters and numbers.";
  return null;
}

/** Sign-in ID for staff. Lowercase only so it can be matched case-insensitively. */
export function validateUsername(name: string): string | null {
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) return "Use 3–32 lowercase letters, digits, dots, dashes or underscores.";
  return null;
}

/** Parses a yyyy-mm-dd string from <input type="date"> to a UTC-midnight Date. */
export function parseDateInput(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDateInput(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}
