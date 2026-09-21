import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

// "Continue with Google" for riders: OpenID Connect authorization-code flow with PKCE (RFC 7636).
// Staff never sign in this way; they use password + authenticator at /staff/login.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
export const OAUTH_COOKIE = "nf_oauth";
const OAUTH_SECONDS = 600;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const base = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return clientId && clientSecret && base ? { clientId, clientSecret, redirectUri: `${base}/api/auth/google/callback` } : null;
}

export const isGoogleConfigured = (): boolean => googleConfig() !== null;

export interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
}

export const challengeFor = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");

export function newOAuthState(): OAuthState {
  return { state: randomBytes(16).toString("hex"), nonce: randomBytes(16).toString("hex"), verifier: randomBytes(32).toString("base64url") };
}

export function buildAuthUrl(cfg: GoogleConfig, s: OAuthState): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: s.state,
    nonce: s.nonce,
    code_challenge: challengeFor(s.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

// The state, nonce and PKCE verifier travel in a short-lived signed cookie, so nothing is stored server-side.
function cookieSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function sealOAuthState(s: OAuthState): Promise<string> {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setAudience("oauth").setIssuedAt().setExpirationTime(`${OAUTH_SECONDS}s`).sign(cookieSecret());
}

export async function openOAuthState(token: string | undefined): Promise<OAuthState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, cookieSecret(), { algorithms: ["HS256"], audience: "oauth" });
    const { state, nonce, verifier } = payload as Partial<OAuthState>;
    return state && nonce && verifier ? { state, nonce, verifier } : null;
  } catch {
    return null;
  }
}

export const statesMatch = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const oauthCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/auth/google",
  maxAge: OAUTH_SECONDS,
});

export async function exchangeCode(cfg: GoogleConfig, code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("Google returned no id_token");
  return body.id_token;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
  name: string | null;
}

let remoteKeys: JWTVerifyGetKey | undefined;

/**
 * Checks signature (Google's published keys), issuer, audience (our client id), expiry, the nonce we
 * sent, and that Google has verified the email address. Anything else throws.
 */
export async function verifyIdToken(idToken: string, opts: { clientId: string; nonce: string; keys?: JWTVerifyGetKey }): Promise<GoogleProfile> {
  const keys = opts.keys ?? (remoteKeys ??= createRemoteJWKSet(new URL(JWKS_URL)));
  const { payload } = await jwtVerify(idToken, keys, { issuer: ISSUERS, audience: opts.clientId, algorithms: ["RS256"] });
  if (typeof payload.nonce !== "string" || !statesMatch(payload.nonce, opts.nonce)) throw new Error("Nonce mismatch");
  if (payload.email_verified !== true && payload.email_verified !== "true") throw new Error("Google email is not verified");
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") throw new Error("Token is missing sub or email");
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { sub: payload.sub, email: payload.email.toLowerCase(), givenName: str(payload.given_name), familyName: str(payload.family_name), name: str(payload.name) };
}
