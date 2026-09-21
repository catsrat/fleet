import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM for personal data at rest (DSGVO Art. 32): payroll fields and every uploaded document.
// Blob layout: iv(12) | authTag(16) | ciphertext.

function key(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error("FIELD_ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptBuffer(blob: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key(), blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}

export function encryptField(value: string): string {
  return "v1:" + encryptBuffer(Buffer.from(value, "utf8")).toString("base64");
}

export function decryptField(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith("v1:")) return null;
  return decryptBuffer(Buffer.from(stored.slice(3), "base64")).toString("utf8");
}

export function maskValue(plain: string | null, visible = 4): string {
  if (!plain) return "—";
  const clean = plain.replace(/\s+/g, "");
  return "•".repeat(Math.max(clean.length - visible, 0)) + clean.slice(-visible);
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
