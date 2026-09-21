/*
 * npm run owner:setup
 *
 * Creates (or updates) THE owner account: the one login that can manage staff. It is created here, on the
 * machine that runs the app, and never through the website, so nobody can claim it by visiting a URL.
 *
 * Interactive by default (the password is typed hidden and never stored in .env or shell history).
 * Non-interactive for automation: OWNER_NAME, OWNER_USERNAME, OWNER_EMAIL, OWNER_PASSWORD (+ OWNER_REPLACE=1
 * to overwrite an existing owner).
 *
 * Flags:
 *   --reset-2fa   clear the owner's authenticator (lost phone and lost recovery codes)
 *   --keep-demo   do not deactivate the demo staff accounts created by `npm run seed:demo`
 */
import { createInterface } from "node:readline/promises";
import { db } from "../lib/db";
import { hashPassword, unusablePasswordHash } from "../lib/passwords";
import { validateStaffPassword, validateUsername } from "../lib/validators";

const DEMO_STAFF_EMAILS = ["admin@nucleusfleet.de", "reviewer@nucleusfleet.de"];
const interactive = process.stdin.isTTY && process.stdout.isTTY;

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "") process.exit(130);
        if (ch === "" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function ask(question: string, envValue: string | undefined, hidden = false): Promise<string> {
  if (envValue !== undefined) return envValue.trim();
  if (!interactive) throw new Error(`Not a terminal: set the matching OWNER_* environment variable for "${question.trim()}"`);
  if (hidden) return askHidden(question);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function main() {
  const existing = await db.user.findFirst({ where: { role: "OWNER" } });

  if (process.argv.includes("--reset-2fa")) {
    if (!existing) fail("There is no owner account yet. Run without flags first.");
    await db.user.update({ where: { id: existing.id }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: null } });
    console.log(`\n✔ Two-factor cleared for "${existing.username ?? existing.email}". You will set up a new authenticator at your next sign-in.\n`);
    return;
  }

  console.log("\nNucleus Fleet: owner account setup\n");
  const name = (await ask("Your name: ", process.env.OWNER_NAME)) || "Owner";
  const username = (await ask("Admin ID (what you type to sign in, e.g. praful): ", process.env.OWNER_USERNAME)).toLowerCase();
  const email = (await ask("Email address: ", process.env.OWNER_EMAIL)).toLowerCase();
  const usernameError = validateUsername(username);
  if (usernameError) fail(usernameError);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("That does not look like an email address.");

  const password = await ask("Password (min. 12 characters, hidden): ", process.env.OWNER_PASSWORD, true);
  const passwordError = validateStaffPassword(password);
  if (passwordError) fail(passwordError);
  if (interactive && process.env.OWNER_PASSWORD === undefined) {
    if ((await askHidden("Repeat password: ")) !== password) fail("The passwords do not match.");
  }

  const clash = await db.user.findFirst({ where: { OR: [{ username }, { email }], NOT: existing ? { id: existing.id } : undefined } });
  if (clash) fail("That ID or email already belongs to another account.");

  if (existing) {
    const replace =
      process.env.OWNER_REPLACE === "1" ||
      (interactive && /^y(es)?$/i.test(await ask(`An owner already exists ("${existing.username ?? existing.email}"). Replace its credentials? [y/N] `, undefined)));
    if (!replace) fail("Nothing changed.");
  }

  const passwordHash = await hashPassword(password);
  const data = { name, username, email, passwordHash, role: "OWNER", active: true, mustChangePassword: false, emailVerifiedAt: new Date() };
  const owner = existing
    ? await db.user.update({ where: { id: existing.id }, data })
    : await db.user.create({ data });
  await db.auditLog.create({
    data: { actorId: owner.id, actorName: owner.name, action: existing ? "OWNER_UPDATED" : "OWNER_CREATED", entityType: "User", entityId: owner.id, meta: JSON.stringify({ via: "cli" }) },
  });

  let deactivated = 0;
  if (!process.argv.includes("--keep-demo")) {
    for (const demoEmail of DEMO_STAFF_EMAILS) {
      if (demoEmail === email) continue;
      const demo = await db.user.findUnique({ where: { email: demoEmail } });
      if (demo && demo.id !== owner.id) {
        // randomised so re-activating the account can never restore the published demo password
        await db.user.update({ where: { id: demo.id }, data: { active: false, passwordHash: await unusablePasswordHash() } });
        deactivated++;
      }
    }
  }

  console.log(`\n✔ Owner account ${existing ? "updated" : "created"}.`);
  console.log(`  Sign in at  /staff/login  with ID "${username}" (or ${email}).`);
  console.log("  At first sign-in you will set up an authenticator app and receive recovery codes.");
  if (deactivated) console.log(`  Deactivated ${deactivated} demo staff account(s).`);
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
