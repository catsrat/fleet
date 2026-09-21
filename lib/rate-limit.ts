import { headers } from "next/headers";
import { db } from "./db";

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

/**
 * Fixed-window limiter kept in the database, so it holds across serverless instances (an in-memory counter
 * would give every instance its own budget). One atomic upsert per call. If the database is unreachable the
 * call throws and the sign-in attempt fails: it fails closed rather than open.
 *
 * All time arithmetic happens inside Postgres on its own UTC clock, in the same "naive UTC" form Prisma uses for
 * DateTime columns. Passing JavaScript dates instead would be converted using the database session's time
 * zone, which differs between environments and silently shifts the window.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const windowSec = Math.max(1, Math.round(windowMs / 1000));
  const rows = await db.$queryRaw<{ count: number; retryAfterSec: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, (now() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSec}))
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimit"."resetAt" <= (now() AT TIME ZONE 'UTC')
                       THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= (now() AT TIME ZONE 'UTC')
                       THEN (now() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSec})
                       ELSE "RateLimit"."resetAt" END
    RETURNING "count",
      GREATEST(0, CEIL(EXTRACT(EPOCH FROM ("resetAt" - (now() AT TIME ZONE 'UTC')))))::int AS "retryAfterSec"`;
  const row = rows[0];

  // Housekeeping: occasionally drop windows that ended, so the table stays small.
  if (Math.random() < 0.02) void db.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } }).catch(() => undefined);

  return row.count <= max ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.max(1, row.retryAfterSec) };
}

export async function resetRateLimit(key: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key } });
}

/** On Vercel the platform sets x-forwarded-for itself, so the client cannot spoof it. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
