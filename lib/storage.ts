import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { decryptBuffer, encryptBuffer } from "./crypto";

// Every file is AES-256-GCM encrypted (lib/crypto.ts) before it is stored, so the storage backend only ever
// holds ciphertext. Callers see opaque storage keys and never know which backend is in use.
//
//  - Vercel Blob (private store): used when BLOB_STORE_ID (OIDC, set automatically when a store is connected
//    to the project) or BLOB_READ_WRITE_TOKEN is present. This is the production path.
//  - Local disk: used otherwise, for development only. Vercel's file system is read-only and ephemeral, so
//    running there without a Blob store is refused rather than silently losing uploads.

const KEY_PATTERN = /^[a-f0-9]{48}\.enc$/;
const localRoot = () => path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage/uploads");
const blobPath = (key: string) => `uploads/${key}`;

function backend(): "blob" | "local" {
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.VERCEL) throw new Error("No Blob store is connected to this project. Create a private Blob store and connect it.");
  return "local";
}

export async function putFile(plain: Buffer): Promise<string> {
  const key = randomBytes(24).toString("hex") + ".enc";
  const body = encryptBuffer(plain);
  if (backend() === "blob") {
    await put(blobPath(key), body, { access: "private", contentType: "application/octet-stream", addRandomSuffix: false, allowOverwrite: false });
    return key;
  }
  await mkdir(localRoot(), { recursive: true });
  await writeFile(path.join(localRoot(), key), body, { flag: "wx" });
  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
  if (backend() === "blob") {
    const result = await get(blobPath(key), { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) throw new Error("File not found in storage");
    return decryptBuffer(Buffer.from(await new Response(result.stream).arrayBuffer()));
  }
  return decryptBuffer(await readFile(path.join(localRoot(), key)));
}

export async function deleteFile(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  if (backend() === "blob") {
    await del(blobPath(key)); // succeeds silently when the blob is already gone
    return;
  }
  try {
    await unlink(path.join(localRoot(), key));
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

