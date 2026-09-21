import { NextResponse } from "next/server";
import { OAUTH_COOKIE, buildAuthUrl, googleConfig, newOAuthState, oauthCookieOptions, sealOAuthState } from "@/lib/google";

/** Step 1: send the rider to Google. State, nonce and the PKCE verifier are sealed into a short-lived cookie. */
export async function GET(req: Request): Promise<Response> {
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL("/login?error=google", req.url));

  const oauth = newOAuthState();
  const res = NextResponse.redirect(buildAuthUrl(cfg, oauth));
  res.cookies.set(OAUTH_COOKIE, await sealOAuthState(oauth), oauthCookieOptions());
  res.headers.set("Cache-Control", "no-store");
  return res;
}
