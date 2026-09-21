// Build command used on Vercel (see vercel.json). Generates the Prisma client, applies pending database
// migrations on PRODUCTION builds only (so preview branches never alter the production database), then
// builds the app.
import { spawnSync } from "node:child_process";

function run(command) {
  console.log(`\n> ${command}`);
  const result = spawnSync(command, { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Prisma's migrate needs a direct (non-pooled) URL. Providers that offer only one URL work with it too.
process.env.DATABASE_URL_UNPOOLED ??= process.env.DATABASE_URL;

run("npx prisma generate");

if (process.env.VERCEL_ENV === "production" || process.env.RUN_MIGRATIONS === "1") {
  if (!process.env.DATABASE_URL) {
    console.error("\nDATABASE_URL is not set. Connect a Postgres database to this project before deploying to production.");
    process.exit(1);
  }
  run("npx prisma migrate deploy");
} else {
  console.log("\nSkipping database migrations (only production builds apply them).");
}

run("npx next build");
