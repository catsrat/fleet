import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { __nfRateLimit?: Map<string, Bucket> };
const buckets = (g.__nfRateLimit ??= new Map<string, Bucket>());

/** In-memory fixed window limiter. Use Redis in a multi-instance deployment. */
export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  return b.count > max ? { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) } : { ok: true, retryAfterSec: 0 };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
