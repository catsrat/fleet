import assert from "node:assert/strict";
import { test } from "node:test";
import { appUrl, notificationEmail, passwordResetEmail } from "../lib/email";

test("builds absolute URLs and never doubles the slash", () => {
  process.env.APP_URL = "https://fleet.example.com/";
  assert.equal(appUrl("/apply"), "https://fleet.example.com/apply");
  process.env.APP_URL = "https://fleet.example.com";
  assert.equal(appUrl("/apply/contract"), "https://fleet.example.com/apply/contract");
  assert.equal(appUrl(), "https://fleet.example.com");
});

test("reset email differs per language and carries the link", () => {
  const url = "https://fleet.example.com/reset?token=abc";
  const en = passwordResetEmail("en", url, 60);
  const de = passwordResetEmail("de", url, 60);
  assert.equal(en.action?.url, url);
  assert.equal(de.action?.url, url);
  assert.match(en.lines[0], /60 minutes/);
  assert.match(de.lines[0], /60 Minuten/);
  assert.notEqual(en.subject, de.subject);
  // the reassurance that nothing changed if you did not ask for it
  assert.match(en.footnote!, /ignore/i);
  assert.match(de.footnote!, /ignorier/i);
});

test("notification email points at the page the rider needs", () => {
  const m = notificationEmail("en", "Your contract is ready", "Open it and confirm.", "/apply/contract");
  assert.equal(m.subject, "Your contract is ready");
  assert.equal(m.lines[0], "Open it and confirm.");
  assert.match(m.action!.url, /\/apply\/contract$/);
});
