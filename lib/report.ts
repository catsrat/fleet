/**
 * Error reporting. Everything is written to the platform log as one JSON line, which Vercel keeps and
 * makes searchable. If ERROR_WEBHOOK_URL is set (a Slack or Discord incoming webhook), a short message is
 * also pushed there so a failure reaches a human without anyone watching a dashboard.
 *
 * Reporting never throws and never blocks the response.
 */
export interface ErrorContext {
  where: string;
  userId?: string;
  path?: string;
  extra?: Record<string, unknown>;
}

const seen = new Map<string, number>();
const THROTTLE_MS = 60_000;

/** Keeps one repeated failure from flooding the webhook. */
function shouldAlert(key: string): boolean {
  const now = Date.now();
  const last = seen.get(key);
  if (last && now - last < THROTTLE_MS) return false;
  seen.set(key, now);
  if (seen.size > 200) for (const [k, t] of seen) if (now - t > THROTTLE_MS) seen.delete(k);
  return true;
}

export function reportError(error: unknown, ctx: ErrorContext): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack?.split("\n").slice(0, 6).join("\n") : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      where: ctx.where,
      message,
      path: ctx.path,
      userId: ctx.userId,
      env: process.env.VERCEL_ENV ?? "development",
      deployment: process.env.VERCEL_DEPLOYMENT_ID,
      ...ctx.extra,
      stack,
    }),
  );

  const webhook = process.env.ERROR_WEBHOOK_URL?.trim();
  if (!webhook || !shouldAlert(`${ctx.where}:${message}`)) return;
  const text = `⚠️ Nucleus Fleet (${process.env.VERCEL_ENV ?? "dev"}) — ${ctx.where}: ${message}${ctx.path ? `\nPath: ${ctx.path}` : ""}`;
  void fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, content: text }), // "text" suits Slack, "content" suits Discord
  }).catch(() => undefined);
}
