import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { decryptBuffer, encryptBuffer } from "./crypto";

// Local encrypted blob store. Swap these three functions for an S3 (eu-central-1)
// implementation in production; callers only ever see opaque storage keys.

const KEY_PATTERN = /^[a-f0-9]{48}\.enc$/;
const root = () => path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage/uploads");

export async function putFile(plain: Buffer): Promise<string> {
  const key = randomBytes(24).toString("hex") + ".enc";
  await mkdir(root(), { recursive: true });
  await writeFile(path.join(root(), key), encryptBuffer(plain), { flag: "wx" });
  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
  return decryptBuffer(await readFile(path.join(root(), key)));
}

export async function deleteFile(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  try {
    await unlink(path.join(root(), key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/webp",
    test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  { mime: "application/pdf", test: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-" },
];

/** Detects the real file type from magic bytes; never trusts the client-supplied MIME type. */
export function sniffMime(buf: Buffer): string | null {
  return SIGNATURES.find((s) => s.test(buf))?.mime ?? null;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
