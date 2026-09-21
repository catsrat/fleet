import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) so any authenticator app works. No third-party dependency.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of input.replace(/=+$/, "").toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const generateTotpSecret = (): string => base32Encode(randomBytes(20));

function hotp(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

export const totpStep = (timeMs: number): number => Math.floor(timeMs / 1000 / STEP_SECONDS);

export function totpAt(secretBase32: string, timeMs: number): string {
  return hotp(base32Decode(secretBase32), totpStep(timeMs));
}

const safeEqual = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Accepts the current code and one step either side (clock drift). Returns the matched step so the caller
 * can store it: a code whose step is not newer than `lastStep` is rejected, which stops replaying a
 * code that was already used or shoulder-surfed.
 */
export function verifyTotp(secretBase32: string, code: string, opts: { now?: number; lastStep?: number | null } = {}): number | null {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const key = base32Decode(secretBase32);
  const current = totpStep(opts.now ?? Date.now());
  for (const step of [current - 1, current, current + 1]) {
    if (opts.lastStep != null && step <= opts.lastStep) continue;
    if (safeEqual(hotp(key, step), clean)) return step;
  }
  return null;
}

export function otpauthUri(account: string, secretBase32: string, issuer = "Nucleus Fleet"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`; // literal colon, as in the Key URI spec
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/** One-time codes for when the phone is lost. Shown once; only their hashes are stored. */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(7)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export const normalizeRecoveryCode = (code: string): string => code.replace(/[\s-]/g, "").toUpperCase();
export const hashRecoveryCode = (code: string): string => createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
