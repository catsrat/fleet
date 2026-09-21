import assert from "node:assert/strict";
import { test } from "node:test";
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUri,
  totpAt,
  totpStep,
  verifyTotp,
} from "../lib/totp";

// RFC 6238 appendix B: ASCII secret "12345678901234567890" (SHA-1). The RFC lists 8-digit codes; the
// last six digits are the 6-digit code.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

test("matches the RFC 6238 test vectors", () => {
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];
  for (const [seconds, expected] of vectors) assert.equal(totpAt(RFC_SECRET, seconds * 1000), expected, `t=${seconds}`);
});

test("base32 round-trips", () => {
  const raw = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
  assert.deepEqual(base32Decode(base32Encode(raw)), raw);
  assert.throws(() => base32Decode("not!valid"));
});

test("accepts the current code and one step of clock drift, nothing else", () => {
  const now = 1_700_000_000_000;
  const at = (offsetSteps: number) => totpAt(RFC_SECRET, now + offsetSteps * 30_000);
  assert.equal(verifyTotp(RFC_SECRET, at(0), { now }), totpStep(now));
  assert.equal(verifyTotp(RFC_SECRET, at(-1), { now }), totpStep(now) - 1);
  assert.equal(verifyTotp(RFC_SECRET, at(1), { now }), totpStep(now) + 1);
  assert.equal(verifyTotp(RFC_SECRET, at(2), { now }), null);
  assert.equal(verifyTotp(RFC_SECRET, at(-2), { now }), null);
});

test("rejects a code that was already used (replay protection)", () => {
  const now = 1_700_000_000_000;
  const code = totpAt(RFC_SECRET, now);
  const step = verifyTotp(RFC_SECRET, code, { now });
  assert.ok(step !== null);
  assert.equal(verifyTotp(RFC_SECRET, code, { now, lastStep: step }), null);
  // an older code inside the drift window is also refused once a newer step was consumed
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 30_000), { now, lastStep: step }), null);
});

test("rejects malformed input", () => {
  for (const bad of ["", "12345", "1234567", "abcdef", "12 34 5"]) assert.equal(verifyTotp(RFC_SECRET, bad, { now: 1e12 }), null, bad);
  assert.notEqual(verifyTotp(RFC_SECRET, " 287 082 ", { now: 59_000 }), null, "spaces are tolerated");
});

test("secrets are unique, 160-bit and authenticator-compatible", () => {
  const a = generateTotpSecret();
  assert.notEqual(a, generateTotpSecret());
  assert.equal(base32Decode(a).length, 20);
  const uri = otpauthUri("owner@example.com", a);
  assert.match(uri, /^otpauth:\/\/totp\/Nucleus%20Fleet:owner%40example\.com\?secret=[A-Z2-7]+&issuer=Nucleus%20Fleet/);
});

test("recovery codes are unique and hash independent of formatting", () => {
  const codes = generateRecoveryCodes(8);
  assert.equal(new Set(codes).size, 8);
  for (const c of codes) assert.match(c, /^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  const c = codes[0];
  assert.equal(hashRecoveryCode(c), hashRecoveryCode(c.toLowerCase().replace("-", " ")));
  assert.notEqual(hashRecoveryCode(codes[0]), hashRecoveryCode(codes[1]));
});
