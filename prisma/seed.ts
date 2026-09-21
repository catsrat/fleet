/* Seed: `npm run seed` creates the admin only. `npm run seed:demo` adds demo riders, bikes and placeholder documents. */
import bcrypt from "bcryptjs";
import { deflateSync } from "node:zlib";
import { db } from "../lib/db";
import { encryptField, sha256 } from "../lib/crypto";
import { putFile } from "../lib/storage";
import { isValidSteuerId } from "../lib/validators";

const DAY = 86_400_000;
const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
const inDays = (n: number) => new Date(today().getTime() + n * DAY);

// ---------- tiny PNG encoder so demo documents need no image library ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function encodePng(w: number, h: number, px: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(px.buffer, px.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

type RGB = [number, number, number];
function placeholder(type: string, tint: number): Buffer {
  const portrait = type === "PROFILE_PHOTO";
  const w = portrait ? 420 : 760;
  const h = portrait ? 520 : 480;
  const px = new Uint8Array(w * h * 3);
  const rect = (x: number, y: number, rw: number, rh: number, c: RGB) => {
    for (let j = Math.max(0, y); j < Math.min(h, y + rh); j++)
      for (let i = Math.max(0, x); i < Math.min(w, x + rw); i++) px.set(c, (j * w + i) * 3);
  };
  const disc = (cx: number, cy: number, r: number, c: RGB) => {
    for (let j = cy - r; j <= cy + r; j++)
      for (let i = cx - r; i <= cx + r; i++)
        if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r && i >= 0 && j >= 0 && i < w && j < h) px.set(c, (j * w + i) * 3);
  };
  const themes: Record<string, [RGB, RGB]> = {
    PROFILE_PHOTO: [[176, 196, 222], [60, 80, 120]],
    ID_FRONT: [[214, 226, 240], [40, 80, 150]],
    ID_BACK: [[214, 226, 240], [40, 80, 150]],
    PERMIT_FRONT: [[221, 236, 224], [30, 110, 70]],
    PERMIT_BACK: [[221, 236, 224], [30, 110, 70]],
    ENROLLMENT_CERT: [[250, 250, 247], [120, 40, 60]],
    HEALTH_INSURANCE: [[236, 247, 246], [10, 130, 120]],
  };
  const [bg, accent] = themes[type] ?? [[240, 240, 240], [90, 90, 90]];
  const shift = (c: RGB, d: number): RGB => [Math.min(255, c[0] + d), Math.min(255, c[1] + d), Math.min(255, c[2] + d)];
  rect(0, 0, w, h, shift(bg, tint));
  if (portrait) {
    disc(210, 210, 95, [232, 190, 160]);
    disc(210, 520, 190, accent);
  } else {
    rect(0, 0, w, 70, accent);
    if (type !== "ID_BACK" && type !== "PERMIT_BACK") rect(36, 110, 170, 220, shift(bg, -35));
    const gray: RGB = [175, 180, 190];
    const startX = type === "ENROLLMENT_CERT" || type === "HEALTH_INSURANCE" ? 36 : 240;
    for (let i = 0; i < 7; i++) rect(startX, 110 + i * 44, 420 - (i % 3) * 60, 14, gray);
    if (type === "ENROLLMENT_CERT") disc(650, 380, 55, [200, 120, 130]);
    rect(36, h - 50, w - 72, 10, accent);
  }
  return encodePng(w, h, px);
}

// ---------- valid-by-construction sample identifiers ----------
/** Nine distinct digits plus one repeated digit (the BZSt pattern), then the ISO 7064 MOD 11,10 check digit. */
function steuerId(n: number): string {
  let s = (n * 2654435761) % 4294967296;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 9; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const nine = pool.slice(0, 9);
  if (nine[0] === 0) [nine[0], nine[1]] = [nine[1], nine[0]];
  const digits = [...nine, nine[Math.floor(rnd() * 9)]];
  let product = 10;
  for (const d of digits) {
    let sum = (d + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  const id = digits.join("") + (11 - product === 10 ? 0 : 11 - product);
  if (!isValidSteuerId(id)) throw new Error(`seed generated an invalid tax id: ${id}`);
  return id;
}
const IBANS = ["DE89370400440532013000", "DE02120300000000202051", "DE75512108001245126199"];

const passwordHash = (pw: string) => bcrypt.hashSync(pw, 12);

async function ensureStaff(email: string, username: string, name: string, role: "ADMIN" | "REVIEWER", password: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  const user = await db.user.create({ data: { email, username, name, role, passwordHash: passwordHash(password) } });
  console.log(`  created demo ${role.toLowerCase()} ${username}`);
  return user;
}

/** Minimal valid one-page PDF so demo payslips open in any viewer. */
function makePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, "\\$&");
  const stream = `BT /F1 14 Tf 60 780 Td 18 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

// ---------- demo riders ----------
type DocType = "PROFILE_PHOTO" | "ID_FRONT" | "ID_BACK" | "PERMIT_FRONT" | "PERMIT_BACK" | "ENROLLMENT_CERT" | "HEALTH_INSURANCE";
type DocStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";
interface DocSeed { status: DocStatus; expires?: number; reason?: string }

interface RiderSeed {
  first: string;
  last: string;
  nationality: string;
  university: string;
  city: string;
  dob: string;
  status: string;
  docs: Partial<Record<DocType, DocSeed>>;
  workAuthorization?: string;
  employmentType?: string;
  priorDays?: number;
  workedDays?: number;
  bike?: string;
  withPayroll?: boolean;
  bikeMode?: string;
  partial?: boolean;
}

const allDocs = (nonEu: boolean, status: DocStatus, over: Partial<Record<DocType, DocSeed>> = {}): Partial<Record<DocType, DocSeed>> => {
  const d: Partial<Record<DocType, DocSeed>> = {
    PROFILE_PHOTO: { status },
    ID_FRONT: { status, expires: 900 },
    ID_BACK: { status },
    ENROLLMENT_CERT: { status, expires: 191 },
    HEALTH_INSURANCE: { status },
  };
  if (nonEu) {
    d.PERMIT_FRONT = { status, expires: 400 };
    d.PERMIT_BACK = { status };
  }
  return { ...d, ...over };
};

const RIDERS: RiderSeed[] = [
  { first: "Anna", last: "Becker", nationality: "Germany", university: "TU Berlin", city: "Berlin", dob: "2002-04-11", status: "SUBMITTED", docs: allDocs(false, "PENDING_REVIEW"), withPayroll: true },
  {
    first: "Rohan", last: "Mehta", nationality: "India", university: "Freie Universität Berlin", city: "Berlin", dob: "2000-09-02", status: "IN_REVIEW", withPayroll: true, priorDays: 0,
    docs: allDocs(true, "APPROVED", { PERMIT_FRONT: { status: "PENDING_REVIEW" }, PERMIT_BACK: { status: "PENDING_REVIEW" }, ENROLLMENT_CERT: { status: "PENDING_REVIEW" } }),
  },
  {
    first: "Leyla", last: "Yilmaz", nationality: "Turkey", university: "LMU München", city: "Munich", dob: "2001-01-23", status: "CHANGES_REQUESTED", withPayroll: true, priorDays: 12,
    docs: allDocs(true, "APPROVED", { ID_FRONT: { status: "REJECTED", reason: "GLARE_SHADOW" }, PERMIT_FRONT: { status: "PENDING_REVIEW" } }),
  },
  { first: "Marta", last: "Kowalski", nationality: "Poland", university: "Humboldt-Universität zu Berlin", city: "Berlin", dob: "2001-06-30", status: "APPROVED", docs: allDocs(false, "APPROVED"), employmentType: "WERKSTUDENT", withPayroll: true },
  { first: "Jonas", last: "Weber", nationality: "Germany", university: "Universität Hamburg", city: "Hamburg", dob: "2000-11-08", status: "ACTIVE", docs: allDocs(false, "APPROVED", { ENROLLMENT_CERT: { status: "APPROVED", expires: 12 } }), employmentType: "MINIJOB", workedDays: 18, bike: "NF-001", withPayroll: true },
  { first: "Chen", last: "Wei", nationality: "China", university: "TU München", city: "Munich", dob: "1999-03-17", status: "ACTIVE", docs: allDocs(true, "APPROVED"), workAuthorization: "RESTRICTED_140", employmentType: "WERKSTUDENT", priorDays: 8, workedDays: 120, bike: "NF-002", withPayroll: true },
  { first: "Ahmed", last: "Hassan", nationality: "Egypt", university: "Universität zu Köln", city: "Cologne", dob: "2000-05-14", status: "ACTIVE", docs: allDocs(true, "APPROVED", { PERMIT_FRONT: { status: "APPROVED", expires: -5 } }), workAuthorization: "RESTRICTED_140", employmentType: "MINIJOB", priorDays: 0, workedDays: 35, bike: "NF-003", withPayroll: true },
  { first: "Sofia", last: "Rossi", nationality: "Italy", university: "Goethe-Universität Frankfurt", city: "Frankfurt", dob: "2003-02-19", status: "DRAFT", docs: { PROFILE_PHOTO: { status: "PENDING_REVIEW" } }, partial: true },
];

// weekday (1 = Mon), from hour, to hour
const AVAILABILITY: Record<string, [number, number, number][]> = {
  Weber: [1, 2, 3, 4, 5].map((d) => [d, 17, 22] as [number, number, number]),
  Wei: [2, 4, 6].map((d) => [d, 16, 22] as [number, number, number]),
  Hassan: [5, 6, 7].map((d) => [d, 18, 23] as [number, number, number]),
};

const BIKES = [
  { code: "NF-001", make: "Cube", model: "Kathmandu Hybrid", service: 74 },
  { code: "NF-002", make: "Gazelle", model: "Ultimate C380", service: 41 },
  { code: "NF-003", make: "Kalkhoff", model: "Image 5", service: -6 },
  { code: "NF-004", make: "Cube", model: "Touring Hybrid", service: 96 },
  { code: "NF-005", make: "Riese & Müller", model: "Nevo", service: 12, status: "MAINTENANCE" },
  { code: "NF-006", make: "Gazelle", model: "Ultimate C380", service: 130 },
];

async function seedDemo(reviewer: { id: string; name: string }) {
  const existing = await db.user.count({ where: { email: { endsWith: "@example.com" } } });
  if (existing > 0) return console.log("  demo data already present — skipping");

  for (const [i, b] of BIKES.entries()) {
    await db.bike.create({
      data: {
        code: b.code, make: b.make, model: b.model, frameNumber: `WNF${2400000 + i * 137}`, batterySerial: `BAT-${9100 + i}`,
        status: b.status ?? "AVAILABLE", purchaseDate: inDays(-300 - i * 20), insuranceUntil: inDays(200 + i * 10), nextServiceDue: inDays(b.service),
      },
    });
  }

  const pw = passwordHash("Rider#Demo2026x");
  let n = 0;
  for (const r of RIDERS) {
    n++;
    const email = `${r.first}.${r.last}@example.com`.toLowerCase();
    const nonEu = !["Germany", "Poland", "Italy"].includes(r.nationality);
    const submitted = r.status !== "DRAFT";
    const ago = (days: number) => new Date(Date.now() - days * DAY);

    const user = await db.user.create({ data: { email, name: `${r.first} ${r.last}`, role: "RIDER", passwordHash: pw } });
    const rider = await db.rider.create({
      data: {
        userId: user.id, firstName: r.first, lastName: r.last, city: r.city, nationality: r.nationality, nationalityGroup: nonEu ? "NON_EU" : "EU",
        university: r.university, dateOfBirth: new Date(`${r.dob}T00:00:00.000Z`), phone: r.partial ? null : `+49 151 ${2000000 + n * 7311}`,
        status: r.status, workAuthorization: r.workAuthorization ?? null, employmentType: r.employmentType ?? null,
        priorDaysWorked: r.priorDays ?? 0, priorDaysDeclaredAt: r.priorDays !== undefined ? ago(20) : null,
        healthInsurer: r.withPayroll ? ["TK", "AOK Nordost", "Barmer", "DAK"][n % 4] : null,
        taxIdEnc: r.withPayroll ? encryptField(steuerId(n)) : null,
        ibanEnc: r.withPayroll ? encryptField(IBANS[n % IBANS.length]) : null,
        svPending: !!r.withPayroll && n % 2 === 0,
        svNumberEnc: r.withPayroll && n % 2 === 1 ? encryptField("15070649C103") : null,
        consentDataAt: r.partial ? null : ago(30), contractAckAt: r.partial ? null : ago(30), conductAckAt: r.partial ? null : ago(30),
        submittedAt: submitted ? ago(10 + n) : null,
        approvedAt: ["APPROVED", "ACTIVE"].includes(r.status) ? ago(6) : null, approvedByName: ["APPROVED", "ACTIVE"].includes(r.status) ? reviewer.name : null,
        activatedAt: r.status === "ACTIVE" ? ago(4) : null,
      },
    });

    await db.auditLog.create({ data: { at: ago(32), actorId: user.id, actorName: user.name, action: "RIDER_REGISTERED", entityType: "Rider", entityId: rider.id, riderId: rider.id } });
    if (submitted) await db.auditLog.create({ data: { at: ago(10 + n), actorId: user.id, actorName: user.name, action: "APPLICATION_SUBMITTED", entityType: "Rider", entityId: rider.id, riderId: rider.id } });

    for (const [type, d] of Object.entries(r.docs) as [DocType, DocSeed][]) {
      const png = placeholder(type, (n * 9 + type.length * 3) % 30);
      const doc = await db.document.create({
        data: {
          riderId: rider.id, type, status: d.status, storageKey: await putFile(png), originalName: `${type.toLowerCase()}.png`, mimeType: "image/png",
          sizeBytes: png.length, sha256: sha256(png), uploadedAt: ago(9 + n),
          expiresAt: d.status === "APPROVED" && d.expires !== undefined ? inDays(d.expires) : null,
          reviewedAt: d.status === "PENDING_REVIEW" ? null : ago(7), reviewedByName: d.status === "PENDING_REVIEW" ? null : reviewer.name,
          rejectionCode: d.status === "REJECTED" ? d.reason ?? "OTHER" : null,
        },
      });
      if (d.status !== "PENDING_REVIEW") {
        await db.auditLog.create({
          data: { at: ago(7), actorId: reviewer.id, actorName: reviewer.name, action: d.status === "APPROVED" ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED", entityType: "Document", entityId: doc.id, riderId: rider.id, meta: JSON.stringify({ type }) },
        });
      }
    }

    if (r.status === "CHANGES_REQUESTED") {
      await db.notification.create({
        data: {
          userId: user.id, kind: "ACTION",
          title: JSON.stringify({ en: "Please upload again: ID card or passport – front", de: "Bitte erneut hochladen: Ausweis oder Reisepass – Vorderseite" }),
          body: JSON.stringify({ en: "There is glare, a reflection or a shadow on the document.", de: "Auf dem Dokument sind Spiegelungen oder Schatten." }),
        },
      });
    }

    if (r.workedDays) {
      const logs = Array.from({ length: r.workedDays }, (_, k) => {
        const date = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1) + (k * 2 + 1) * DAY);
        return { riderId: rider.id, date, hours: k % 5 === 0 ? 3.5 : 5.5, createdByName: reviewer.name };
      }).filter((l) => l.date.getTime() < today().getTime());
      await db.workLog.createMany({ data: logs });
    }

    if (r.bike) {
      const bike = await db.bike.findUniqueOrThrow({ where: { code: r.bike } });
      await db.bikeAssignment.create({ data: { bikeId: bike.id, riderId: rider.id, assignedAt: ago(4), conditionOut: "Good, battery 100%", depositCents: 5000 } });
      await db.bike.update({ where: { id: bike.id }, data: { status: "ASSIGNED" } });
    }

    if (r.status === "ACTIVE") {
      const slots = AVAILABILITY[r.last];
      if (slots) await db.availabilitySlot.createMany({ data: slots.map(([weekday, from, to]) => ({ riderId: rider.id, weekday, startMinute: from * 60, endMinute: to * 60 })) });
      for (const [i, [year, month]] of [[2026, 7], [2026, 8]].entries()) {
        const pdf = makePdf(["Nucleus Fleet GmbH", `Lohnabrechnung ${String(month).padStart(2, "0")}/${year}`, `${r.first} ${r.last}`, "Demo document - not a real payslip"]);
        await db.payslip.create({
          data: {
            riderId: rider.id, kind: "PAYSLIP", year, month, storageKey: await putFile(pdf), originalName: `Lohnabrechnung_${year}-${String(month).padStart(2, "0")}.pdf`,
            sizeBytes: pdf.length, sha256: sha256(pdf), uploadedByName: "Demo Admin", uploadedAt: ago(20 - i * 14),
            firstDownloadedAt: i === 0 ? ago(15) : null, downloadCount: i === 0 ? 1 : 0,
          },
        });
      }
    }
  }
  console.log(`  created ${RIDERS.length} demo riders and ${BIKES.length} e-bikes (rider password: Rider#Demo2026x)`);
}

async function main() {
  if (!process.argv.includes("--demo")) {
    console.log("Nothing to seed. Create your real login with `npm run owner:setup`; use `npm run seed:demo` for sample data.");
    return;
  }
  console.log("Seeding demo data…");
  await ensureStaff("admin@nucleusfleet.de", "demo-admin", "Demo Admin", "ADMIN", "DemoAdmin#2026x");
  const reviewer = await ensureStaff("reviewer@nucleusfleet.de", "demo-reviewer", "Mia Reviewer", "REVIEWER", "DemoReviewer#2026x");
  await seedDemo(reviewer);
  console.log("Done. Demo staff are deactivated automatically when you run `npm run owner:setup`.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
