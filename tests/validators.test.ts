import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidIban, isValidSteuerId, isValidSvNumber, validateStaffPassword, validateUsername } from "../lib/validators";

test("IBAN mod-97 check", () => {
  assert.ok(isValidIban("DE89 3704 0044 0532 0130 00"));
  assert.ok(isValidIban("GB29 NWBK 6016 1331 9268 19"));
  assert.ok(!isValidIban("DE89 3704 0044 0532 0130 01"));
  assert.ok(!isValidIban("DE89 3704 0044 0532 0130"), "German IBANs are 22 characters");
});

test("Steuer-ID checksum and structure", () => {
  assert.ok(isValidSteuerId("65929970489"));
  assert.ok(!isValidSteuerId("65929970480"), "bad check digit");
  assert.ok(!isValidSteuerId("05929970489"), "leading zero");
});

test("social security number check digit", () => {
  assert.ok(isValidSvNumber("15 070649 C 103"));
  assert.ok(!isValidSvNumber("15070649C104"));
});

test("staff passwords are stricter than rider passwords", () => {
  assert.ok(validateStaffPassword("short1"));
  assert.ok(validateStaffPassword("onlyletterslongenough"), "needs a digit");
  assert.ok(validateStaffPassword("123456789012345"), "needs a letter");
  assert.equal(validateStaffPassword("A-long-passphrase-42"), null);
});

test("usernames", () => {
  assert.equal(validateUsername("praful.reddy"), null);
  assert.ok(validateUsername("ab"));
  assert.ok(validateUsername("has space"));
  assert.ok(validateUsername("UPPER"), "must be lowercase so sign-in is case-insensitive");
  assert.ok(validateUsername("x".repeat(33)));
});
