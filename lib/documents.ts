// Document catalog for a student e-bike courier on Uber Eats in Germany.
//
// Uber's own bicycle-courier baseline: 18+, valid government photo ID, profile photo, residence permit
// where applicable; originals photographed (no scans), all four corners visible, no glare/blur/expiry;
// Uber then runs its own third-party background check. On top of that, Nucleus Fleet acts as the
// *employer* (Uber Eats DE works through fleet partners), so we also collect what German payroll and
// immigration law require: enrollment certificate, health insurance, and — for non-EU students — the
// residence permit with its employment restriction (§ 4a AufenthG: copy kept for the duration of employment).

export const DOC_TYPES = [
  "PROFILE_PHOTO",
  "ID_FRONT",
  "ID_BACK",
  "PERMIT_FRONT",
  "PERMIT_BACK",
  "PERMIT_ADDENDUM",
  "ENROLLMENT_CERT",
  "HEALTH_INSURANCE",
  "BIKE_PHOTO",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type Locale = "en" | "de";
type Copy = { label: string; help: string };
type Check = { id: string; text: string };

export interface DocSpec {
  type: DocType;
  en: Copy;
  de: Copy;
  /** Expiry date reviewers must record: required blocks approval without it. */
  expiry: "none" | "required" | "optional";
  expiryLabel?: string;
  optional?: boolean;
  checks: Check[];
}

const COMMON: Check[] = [
  { id: "corners", text: "All four corners of the document are visible" },
  { id: "legible", text: "Text is legible — no blur, glare, shadows or obstructions" },
  { id: "original", text: "Photo of the original (not a screen, scan or photocopy)" },
];

export const DOC_SPECS: Record<DocType, DocSpec> = {
  PROFILE_PHOTO: {
    type: "PROFILE_PHOTO",
    en: {
      label: "Profile photo",
      help: "A clear, front-facing photo of your face — no sunglasses, cap or filters. It becomes your Uber courier profile photo.",
    },
    de: {
      label: "Profilfoto",
      help: "Ein klares Foto deines Gesichts von vorn – ohne Sonnenbrille, Mütze oder Filter. Es wird dein Uber-Kurierprofilfoto.",
    },
    expiry: "none",
    checks: [
      { id: "face", text: "Face clearly visible, front-facing, good lighting" },
      { id: "nofilter", text: "No sunglasses, cap, mask or filters" },
      { id: "match", text: "Person matches the photo on the ID document" },
    ],
  },
  ID_FRONT: {
    type: "ID_FRONT",
    en: {
      label: "ID card or passport – front",
      help: "Valid government-issued photo ID (Personalausweis, EU ID card, or the photo page of your passport). Photograph the original — no scans or photocopies. All four corners must be visible.",
    },
    de: {
      label: "Ausweis oder Reisepass – Vorderseite",
      help: "Gültiger amtlicher Lichtbildausweis (Personalausweis, EU-Ausweis oder Foto-Seite des Reisepasses). Fotografiere das Original – keine Scans oder Kopien. Alle vier Ecken müssen sichtbar sein.",
    },
    expiry: "required",
    expiryLabel: "ID valid until",
    checks: [
      ...COMMON,
      { id: "name", text: "Name and date of birth match the applicant's profile" },
      { id: "valid", text: "Document is not expired" },
    ],
  },
  ID_BACK: {
    type: "ID_BACK",
    en: {
      label: "ID card – back",
      help: "The back side of your ID card. Not needed if you use a passport.",
    },
    de: {
      label: "Ausweis – Rückseite",
      help: "Die Rückseite deines Personalausweises. Bei Reisepass nicht nötig.",
    },
    expiry: "none",
    checks: [...COMMON],
  },
  PERMIT_FRONT: {
    type: "PERMIT_FRONT",
    en: {
      label: "Residence permit (eAT card) – front",
      help: "Required for students from outside the EU/EEA/Switzerland: your electronic residence permit for studying (§ 16b AufenthG). It must be valid on your start date.",
    },
    de: {
      label: "Aufenthaltstitel (eAT-Karte) – Vorderseite",
      help: "Für Studierende aus Nicht-EU-Ländern erforderlich: dein elektronischer Aufenthaltstitel zum Studium (§ 16b AufenthG). Er muss zum Arbeitsbeginn gültig sein.",
    },
    expiry: "required",
    expiryLabel: "Permit valid until",
    checks: [
      ...COMMON,
      { id: "type", text: "Permit type allows study (Aufenthaltserlaubnis § 16b) and is not expired" },
      { id: "name", text: "Name matches the ID document" },
    ],
  },
  PERMIT_BACK: {
    type: "PERMIT_BACK",
    en: {
      label: "Residence permit (eAT card) – back",
      help: "The back of the card. It carries the remarks on whether you may work (e.g. \"Beschäftigung bis zu 140 Tage\").",
    },
    de: {
      label: "Aufenthaltstitel (eAT-Karte) – Rückseite",
      help: "Die Rückseite der Karte. Dort stehen die Hinweise zur Erwerbstätigkeit (z. B. „Beschäftigung bis zu 140 Tage“).",
    },
    expiry: "none",
    checks: [
      ...COMMON,
      { id: "workrule", text: "Employment permission / remarks are readable — set the work authorization below" },
    ],
  },
  PERMIT_ADDENDUM: {
    type: "PERMIT_ADDENDUM",
    en: {
      label: "Supplementary sheet (Zusatzblatt)",
      help: "Only if your permit refers to a \"Zusatzblatt\". It states how much you may work, e.g. 140 full days or 280 half days per year.",
    },
    de: {
      label: "Zusatzblatt zum Aufenthaltstitel",
      help: "Nur falls dein Aufenthaltstitel auf ein „Zusatzblatt“ verweist. Dort steht, wie viel du arbeiten darfst, z. B. 140 volle oder 280 halbe Tage pro Jahr.",
    },
    expiry: "none",
    optional: true,
    checks: [
      ...COMMON,
      { id: "workrule", text: "Work limit is readable — set the work authorization below" },
    ],
  },
  ENROLLMENT_CERT: {
    type: "ENROLLMENT_CERT",
    en: {
      label: "Enrollment certificate (Immatrikulationsbescheinigung)",
      help: "Your certificate for the current semester, showing your name, university and semester. We need a fresh one every semester to keep you cleared to ride.",
    },
    de: {
      label: "Immatrikulationsbescheinigung",
      help: "Deine Bescheinigung für das aktuelle Semester mit Name, Hochschule und Semester. Wir benötigen jedes Semester eine neue, damit du weiterfahren darfst.",
    },
    expiry: "required",
    expiryLabel: "Valid until (end of semester)",
    checks: [
      ...COMMON,
      { id: "name", text: "Name matches the ID document" },
      { id: "current", text: "Certificate covers the current semester" },
      { id: "uni", text: "University matches the applicant's profile" },
    ],
  },
  HEALTH_INSURANCE: {
    type: "HEALTH_INSURANCE",
    en: {
      label: "Health insurance proof",
      help: "Membership certificate from your statutory health insurer (e.g. TK, AOK, Barmer) — we need it to register you for payroll. Privately insured: your insurance certificate.",
    },
    de: {
      label: "Nachweis der Krankenversicherung",
      help: "Mitgliedsbescheinigung deiner gesetzlichen Krankenkasse (z. B. TK, AOK, Barmer) – wird für die Anmeldung zur Lohnabrechnung benötigt. Bei privater Versicherung: deine Versicherungsbescheinigung.",
    },
    expiry: "optional",
    expiryLabel: "Valid until (if stated)",
    checks: [
      { id: "legible", text: "Text is legible — no blur, glare, shadows or obstructions" },
      { id: "name", text: "Name matches the ID document" },
      { id: "insurer", text: "Insurer and member/insurance number are visible" },
    ],
  },
  BIKE_PHOTO: {
    type: "BIKE_PHOTO",
    en: {
      label: "Photo of your e-bike",
      help: "Only if you ride your own bike: show the whole bike and the rating plate with motor power (max. 250 W) and assist limit (25 km/h). Pedelecs only — no S-Pedelecs. Lights, brakes and bell must work.",
    },
    de: {
      label: "Foto deines E-Bikes",
      help: "Nur wenn du dein eigenes Rad nutzt: das ganze Rad und das Typenschild mit Motorleistung (max. 250 W) und Unterstützung bis 25 km/h. Nur Pedelecs – keine S-Pedelecs. Licht, Bremsen und Klingel müssen funktionieren.",
    },
    expiry: "none",
    checks: [
      { id: "whole", text: "Whole bike is visible" },
      { id: "plate", text: "Rating plate shows ≤ 250 W motor and ≤ 25 km/h assist (pedelec)" },
      { id: "safe", text: "Lights, brakes and bell present (StVZO)" },
    ],
  },
};

export interface RiderDocContext {
  nationalityGroup: string;
  idType: string;
  bikeMode: string;
}

export interface DocSection {
  id: "identity" | "permit" | "student" | "insurance" | "bike";
  en: string;
  de: string;
  docs: (r: RiderDocContext) => DocType[];
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "identity",
    en: "Identity",
    de: "Identität",
    docs: (r) => (r.idType === "PASSPORT" ? ["PROFILE_PHOTO", "ID_FRONT"] : ["PROFILE_PHOTO", "ID_FRONT", "ID_BACK"]),
  },
  {
    id: "permit",
    en: "Residence permit",
    de: "Aufenthaltstitel",
    docs: (r) => (r.nationalityGroup === "NON_EU" ? ["PERMIT_FRONT", "PERMIT_BACK", "PERMIT_ADDENDUM"] : []),
  },
  { id: "student", en: "Student status", de: "Studierendenstatus", docs: () => ["ENROLLMENT_CERT"] },
  { id: "insurance", en: "Health insurance", de: "Krankenversicherung", docs: () => ["HEALTH_INSURANCE"] },
  { id: "bike", en: "Your e-bike", de: "Dein E-Bike", docs: (r) => (r.bikeMode === "OWN_BIKE" ? ["BIKE_PHOTO"] : []) },
];

export function applicableDocTypes(r: RiderDocContext): DocType[] {
  return DOC_SECTIONS.flatMap((s) => s.docs(r));
}

export function requiredDocTypes(r: RiderDocContext): DocType[] {
  return applicableDocTypes(r).filter((t) => !DOC_SPECS[t].optional);
}

export const REJECTION_REASONS: Record<string, { en: string; de: string }> = {
  BLURRY: { en: "The photo is blurry or not legible.", de: "Das Foto ist unscharf oder nicht lesbar." },
  GLARE_SHADOW: { en: "There is glare, a reflection or a shadow on the document.", de: "Auf dem Dokument sind Spiegelungen oder Schatten." },
  CORNERS_CUT: { en: "Not all four corners of the document are visible.", de: "Es sind nicht alle vier Ecken des Dokuments sichtbar." },
  NOT_ORIGINAL: { en: "Please photograph the original document — no screenshots, scans or photocopies.", de: "Bitte fotografiere das Originaldokument – keine Screenshots, Scans oder Kopien." },
  EXPIRED: { en: "The document is expired or expires too soon.", de: "Das Dokument ist abgelaufen oder läuft zu bald ab." },
  WRONG_DOCUMENT: { en: "This is not the document we asked for.", de: "Das ist nicht das angeforderte Dokument." },
  NAME_MISMATCH: { en: "The name does not match your profile or ID.", de: "Der Name stimmt nicht mit deinem Profil oder Ausweis überein." },
  INCOMPLETE: { en: "The document is incomplete — a page or side is missing.", de: "Das Dokument ist unvollständig – eine Seite fehlt." },
  PERMIT_NO_WORK: { en: "Your residence permit does not allow employment.", de: "Dein Aufenthaltstitel erlaubt keine Erwerbstätigkeit." },
  OUTDATED_SEMESTER: { en: "The certificate is not for the current semester.", de: "Die Bescheinigung gilt nicht für das aktuelle Semester." },
  OTHER: { en: "See the note from our team.", de: "Siehe Hinweis unseres Teams." },
};

export function rejectionText(code: string | null, note: string | null, locale: Locale): string {
  const base = code && REJECTION_REASONS[code] ? REJECTION_REASONS[code][locale] : "";
  return [base, note].filter(Boolean).join(" ");
}
