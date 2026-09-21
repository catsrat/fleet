# Nucleus Fleet

Rider onboarding and fleet back-office for a German Uber Eats fleet partner that employs student couriers on e-bikes.

- **Rider portal** (`/apply`, English + German): guided document checklist, phone-camera uploads, per-document status and rejection reasons, **payslips**, weekly **availability**, "Continue with Google".
- **Back-office** (`/admin`): review queue, document viewer with per-document checklists, Uber activation pipeline, work-day compliance, **schedule and coverage**, e-bike fleet, **payroll documents**, audit log, team management, CSV exports.
- **Staff sign-in** (`/staff/login`): separate from the rider login, password plus authenticator app.

## Run it

Requires Node 20+.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env. Then fill in SESSION_SECRET and FIELD_ENCRYPTION_KEY
npm run db:push             # create the SQLite database
npm run owner:setup         # create YOUR admin login (see below)
npm run dev                 # http://localhost:3000
```

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

Optional sample data: `npm run seed:demo` adds demo staff (`demo-admin` / `DemoAdmin#2026x`, `demo-reviewer` / `DemoReviewer#2026x`), 8 riders in every pipeline state, 6 e-bikes, payslips and availability. Demo riders sign in with `<first>.<last>@example.com` / `Rider#Demo2026x`. **These passwords are published in this repository; never seed demo data on a real deployment.**

npm 11.17+ blocks install scripts by default; this repo approves only the three Prisma packages (`allowScripts` in `package.json`).

## Your admin login (owner)

`npm run owner:setup` asks for your name, an **admin ID** (what you type to sign in), email and password (typed hidden, never stored in `.env` or shell history). It creates the one **OWNER** account and deactivates the demo staff accounts. The owner can only be created or changed this way, never through the website, so nobody can claim it by visiting a URL.

- Sign in at `/staff/login` with your ID (or email) and password. On first sign-in you scan a QR code with an authenticator app and receive 8 one-time recovery codes.
- Lost the phone and the recovery codes? Run `npm run owner:setup -- --reset-2fa` on the server.
- Roles: **OWNER** (everything, plus the Team page) > **ADMIN** (payroll data, payslips, exports, audit log) > **REVIEWER** (verifies documents, sees no payroll). Only the owner creates or deactivates staff; new staff get a temporary password and must change it and set up two-factor at first sign-in.
- Staff sessions last 12 hours. Staff cannot sign in through the rider login or with Google.

## Payslips

Admins upload PDFs under **Payroll** (per rider, per month; also earnings statements for self-employed couriers and annual certificates). Riders see them under **Payslips** in their own account and get an in-app notification. Uploading again for the same period replaces it and keeps the old file for retention; Delete is for files put on the wrong rider. Files are encrypted, riders can only open their own, reviewers cannot open any, and every staff view is audit-logged. The first time a rider opens a document is recorded.

## Availability and going online with Uber

Riders set weekly slots (e.g. 17:00-22:00) under **Availability**. The app enforces the Arbeitszeitgesetz limits (max 10 h a day, 11 h rest between days) and warns about the 20 h Werkstudent week and the non-EU 140-day allowance. **Schedule** shows who should be online right now (in their own slot and cleared to ride), who has a slot but must stay offline (expired permit, day limit reached), an enable/disable queue for slot starts and ends, and a weekly coverage heatmap.

Important: Uber's documented fleet API (Supplier Performance Data) is **read-only**; it reports whether a courier is online, offline or on a trip but cannot block or allow anyone. The app therefore tells your team who may be online; it cannot switch anyone off by itself. To enforce it automatically you need a write mechanism from Uber; ask your Uber fleet manager what exists for your account.

## Google sign-in (riders)

Set `APP_URL`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. In Google Cloud Console create an OAuth client of type **Web application** and add `${APP_URL}/api/auth/google/callback` as an authorised redirect URI. The button appears once all three are set. It uses the OpenID Connect code flow with PKCE, state and nonce, and verifies the ID token signature, issuer, audience, expiry and that Google verified the email. If a rider already registered with a password using the same email, the account is linked and the old password is replaced, so someone who registered with an email they do not own cannot keep access.

## Documents required

| Document | Who | Why |
| --- | --- | --- |
| Profile photo | all | Uber courier profile photo |
| ID card or passport (front, plus back for ID cards) | all | Uber: valid government photo ID, 18+ for bicycle couriers |
| Residence permit (eAT front + back, Zusatzblatt if referenced) | non-EU/EEA/CH | Uber: residence permit where applicable. An employer must check it allows work and keep a copy for the duration of employment (§ 4a AufenthG) |
| Enrollment certificate (Immatrikulationsbescheinigung), every semester | all | Student status; drives the Werkstudent/Minijob setup |
| Health insurance proof | all | Payroll registration |
| Tax ID (Steuer-ID), IBAN, health insurer; social security no. (or "please request") | all | Payroll. Validated (checksums), stored encrypted |
| Photo of own e-bike + rating plate | only if riding own bike | Pedelec (max. 250 W / 25 km/h) counts as a bicycle; S-Pedelecs are not allowed |
| Declaration of days already worked this year | non-EU | Counts toward the 140 full / 280 half day limit across all employers |

Uber's rules, mirrored in the review checklists: photograph the **original** (no scans or screenshots), all four corners visible, legible, no glare, not expired. Uber then runs its own ID and background check; Nucleus Fleet's verification happens before that and does not replace it.

## Tests

`npm test` runs 29 tests: the TOTP code against the RFC 6238 vectors, Google ID-token verification (forged signature, `alg=none`, wrong audience or issuer, expiry, nonce replay, unverified email), PKCE, availability rules (rest periods, daylight saving), and the German tax ID, social security and IBAN checksums.

## Before production

1. Legal review by a German employment lawyer and tax advisor (employee vs. self-employed model, contract, privacy notice in `lib/i18n.ts`, retention periods). This is not legal advice.
2. Switch `prisma/schema.prisma` to PostgreSQL; string `contains` filters then need `mode: "insensitive"`.
3. Replace `lib/storage.ts` with S3 (eu-central-1) using the same three functions; keep `FIELD_ENCRYPTION_KEY` in a secrets manager and plan key rotation.
4. Serve over HTTPS behind a trusted proxy (the rate limiter reads `x-forwarded-for`); move the rate limiter to Redis if you run several instances.
5. Add email/SMS delivery for notifications and password reset (today an admin issues temporary passwords), a retention job that purges documents of rejected applicants, and database backups.
6. Consider automated identity verification (ID plus selfie liveness); verification is manual today.
