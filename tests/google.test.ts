import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import {
  buildAuthUrl,
  challengeFor,
  exchangeCode,
  newOAuthState,
  openOAuthState,
  sealOAuthState,
  verifyIdToken,
  type GoogleConfig,
} from "../lib/google";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-123456";
const cfg: GoogleConfig = { clientId: "client-123.apps.googleusercontent.com", clientSecret: "shh", redirectUri: "https://app.example.com/api/auth/google/callback" };

async function fixture() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.iss ?? "https://accounts.google.com")
      .setAudience(opts.aud ?? cfg.clientId)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(opts.key ?? privateKey);
  return { keys, sign };
}
const good = { sub: "1234567890", email: "Rider@Example.com", email_verified: true, nonce: "n-1", given_name: "Rana", family_name: "Sen" };

test("PKCE challenge matches the RFC 7636 example", () => {
  assert.equal(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("authorization URL carries state, nonce and an S256 challenge", () => {
  const s = newOAuthState();
  const url = new URL(buildAuthUrl(cfg, s));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), cfg.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), cfg.redirectUri);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("state"), s.state);
  assert.equal(url.searchParams.get("nonce"), s.nonce);
  assert.equal(url.searchParams.get("code_challenge"), challengeFor(s.verifier));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(!url.toString().includes(s.verifier), "the verifier itself never leaves the server");
});

test("state cookie round-trips and rejects tampering or garbage", async () => {
  const s = newOAuthState();
  const token = await sealOAuthState(s);
  assert.deepEqual(await openOAuthState(token), s);
  assert.equal(await openOAuthState(token.slice(0, -3) + "abc"), null);
  assert.equal(await openOAuthState("not-a-token"), null);
  assert.equal(await openOAuthState(undefined), null);
});

test("accepts a valid Google ID token and normalises the email", async () => {
  const { keys, sign } = await fixture();
  const profile = await verifyIdToken(await sign(good), { clientId: cfg.clientId, nonce: "n-1", keys });
  assert.deepEqual(profile, { sub: "1234567890", email: "rider@example.com", givenName: "Rana", familyName: "Sen", name: null });
  const legacyIssuer = await verifyIdToken(await sign(good, { iss: "accounts.google.com" }), { clientId: cfg.clientId, nonce: "n-1", keys });
  assert.equal(legacyIssuer.sub, "1234567890");
});

test("rejects tokens that fail any check", async () => {
  const { keys, sign } = await fixture();
  const opts = { clientId: cfg.clientId, nonce: "n-1", keys };
  await assert.rejects(verifyIdToken(await sign(good, { aud: "someone-elses-client" }), opts), /"aud"/);
  await assert.rejects(verifyIdToken(await sign(good, { iss: "https://evil.example.com" }), opts), /"iss"/);
  await assert.rejects(verifyIdToken(await sign(good, { exp: "-1m" }), opts), /"exp"/);
  await assert.rejects(verifyIdToken(await sign({ ...good, nonce: "replayed" }), opts), /Nonce/);
  await assert.rejects(verifyIdToken(await sign({ ...good, nonce: undefined }), opts), /Nonce/);
  await assert.rejects(verifyIdToken(await sign({ ...good, email_verified: false }), opts), /not verified/);
  await assert.rejects(verifyIdToken(await sign({ ...good, email_verified: undefined }), opts), /not verified/);
  await assert.rejects(verifyIdToken(await sign({ ...good, email: undefined }), opts), /missing/);
});

test("rejects a token signed by a key Google did not publish", async () => {
  const { keys } = await fixture();
  const other = await generateKeyPair("RS256");
  const forged = await new SignJWT(good)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer("https://accounts.google.com")
    .setAudience(cfg.clientId)
    .setExpirationTime("5m")
    .sign(other.privateKey);
  await assert.rejects(verifyIdToken(forged, { clientId: cfg.clientId, nonce: "n-1", keys }));
});

test("rejects an unsigned (alg=none) token", async () => {
  const { keys } = await fixture();
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ ...good, iss: "https://accounts.google.com", aud: cfg.clientId, exp: 4102444800 })}.`;
  await assert.rejects(verifyIdToken(unsigned, { clientId: cfg.clientId, nonce: "n-1", keys }));
});

test("code exchange posts the PKCE verifier and returns the id_token", async () => {
  let seen: { url: string; body: URLSearchParams } | undefined;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url, body: init.body as URLSearchParams };
    return new Response(JSON.stringify({ id_token: "the.id.token", access_token: "ignored" }), { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(await exchangeCode(cfg, "auth-code", "verifier-abc", fake), "the.id.token");
  assert.equal(seen?.url, "https://oauth2.googleapis.com/token");
  assert.equal(seen?.body.get("code"), "auth-code");
  assert.equal(seen?.body.get("code_verifier"), "verifier-abc");
  assert.equal(seen?.body.get("grant_type"), "authorization_code");
  const failing = (async () => new Response("nope", { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(exchangeCode(cfg, "x", "y", failing), /token exchange failed/);
});
