import { timingSafeEqual } from "node:crypto";
import { reportError } from "@/lib/report";
import { runRetention } from "@/lib/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // fail closed: no secret configured means the endpoint stays shut
  const header = req.headers.get("authorization") ?? "";
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Called by Vercel Cron (see vercel.json). Vercel sends CRON_SECRET as a bearer token. */
export async function GET(req: Request): Promise<Response> {
  if (!authorised(req)) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await runRetention();
    console.info("[retention]", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch (err) {
    reportError(err, { where: "cron/retention" });
    return Response.json({ ok: false }, { status: 500 });
  }
}
