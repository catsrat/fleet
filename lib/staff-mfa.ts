import QRCode from "qrcode";
import { decryptField, encryptField } from "./crypto";
import { db } from "./db";
import { generateTotpSecret, otpauthUri } from "./totp";

/** Staff must use two-factor unless an operator explicitly sets STAFF_2FA=optional (local development only). */
export const twoFactorRequired = (): boolean => process.env.STAFF_2FA !== "optional";

/**
 * Returns the not-yet-confirmed secret for an account that is enrolling, creating one on first visit.
 * The secret is stored (encrypted) straight away so a page reload shows the same QR code.
 */
export async function ensureEnrollmentSecret(user: { id: string; totpSecretEnc: string | null; totpEnabledAt: Date | null }): Promise<string> {
  const existing = decryptField(user.totpSecretEnc);
  if (existing && !user.totpEnabledAt) return existing;
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { totpSecretEnc: encryptField(secret), totpEnabledAt: null, totpLastStep: null } });
  return secret;
}

export async function enrollmentQr(account: string, secret: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri(account, secret), { margin: 1, width: 220, errorCorrectionLevel: "M" });
}

export const groupSecret = (secret: string): string => secret.match(/.{1,4}/g)?.join(" ") ?? secret;
