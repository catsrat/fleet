import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { OAUTH_COOKIE, exchangeCode, googleConfig, oauthCookieOptions, openOAuthState, statesMatch, verifyIdToken } from "@/lib/google";
import { resolveGoogleUser } from "@/lib/google-account";
import { LOCALE_COOKIE } from "@/lib/locale";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";

/** Step 2: Google sends the rider back with a one-time code. Every failure ends at the login page with no detail. */
export async function GET(req: NextRequest): Promise<Response> {
  const fail = () => {
    const res = NextResponse.redirect(new URL("/login?error=google", req.url));
    res.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0 });
    return res;
  };

  const cfg = googleConfig();
  if (!cfg || !(await rateLimit(`google:${await clientIp()}`, 30, 10 * 60_000)).ok) return fail();

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const returnedState = params.get("state");
  const sealed = await openOAuthState(req.cookies.get(OAUTH_COOKIE)?.value);
  if (params.get("error") || !code || !returnedState || !sealed || !statesMatch(returnedState, sealed.state)) return fail();

  try {
    const idToken = await exchangeCode(cfg, code, sealed.verifier);
    const profile = await verifyIdToken(idToken, { clientId: cfg.clientId, nonce: sealed.nonce });
    const locale = req.cookies.get(LOCALE_COOKIE)?.value === "de" ? "de" : "en";
    const result = await resolveGoogleUser(profile, locale);
    if (!result.ok) return fail();

    await db.user.update({ where: { id: result.user.id }, data: { lastLoginAt: new Date() } });
    await createSession(result.user.id, result.user.role);
    const res = NextResponse.redirect(new URL("/apply", req.url));
    res.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0 });
    return res;
  } catch (err) {
    console.error("Google sign-in failed:", err instanceof Error ? err.message : err);
    return fail();
  }
}
