export const COMPANY = {
  name: "Nucleus Fleet",
  legalName: "Nucleus Fleet GmbH",
  supportEmail: "riders@nucleusfleet.de",
} as const;

export const RIDER_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "UBER_ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
  "OFFBOARDED",
  "REJECTED",
] as const;
export type RiderStatus = (typeof RIDER_STATUSES)[number];

export const STATUS_LABEL: Record<RiderStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  UBER_ONBOARDING: "Uber onboarding",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  OFFBOARDED: "Offboarded",
  REJECTED: "Rejected",
};

export const STATUS_TONE: Record<RiderStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-800",
  IN_REVIEW: "bg-indigo-100 text-indigo-800",
  CHANGES_REQUESTED: "bg-amber-100 text-amber-800",
  APPROVED: "bg-teal-100 text-teal-800",
  UBER_ONBOARDING: "bg-cyan-100 text-cyan-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  SUSPENDED: "bg-orange-100 text-orange-800",
  OFFBOARDED: "bg-slate-200 text-slate-600",
  REJECTED: "bg-rose-100 text-rose-800",
};

/** Riders who can already plan shifts: approved and beyond. */
export const CAN_SET_AVAILABILITY: string[] = ["APPROVED", "UBER_ONBOARDING", "ACTIVE"];

export const EMPLOYMENT_TYPES = {
  MINIJOB: "Minijob (geringfügig)",
  WERKSTUDENT: "Werkstudent (max. 20 h/week in term)",
  SHORT_TERM: "Short-term (kurzfristig)",
} as const;
export type EmploymentType = keyof typeof EMPLOYMENT_TYPES;

export const WORK_AUTH = {
  RESTRICTED_140: "Restricted: 140 full / 280 half days per year (§16b AufenthG)",
  UNRESTRICTED: "Unrestricted employment permitted",
  NOT_PERMITTED: "Employment NOT permitted",
} as const;
export type WorkAuth = keyof typeof WORK_AUTH;

/** Non-EU students may work 140 full days or 280 half days per calendar year. */
export const STUDENT_DAY_LIMIT = 140;
/** A working day of more than 4 hours counts as a full day, otherwise a half day. */
export const FULL_DAY_HOURS = 4;
/** Werkstudent privilege: max weekly hours during the lecture period. */
export const WERKSTUDENT_WEEKLY_HOURS = 20;
export const MIN_RIDER_AGE = 18;
export const EXPIRY_WARNING_DAYS = 30;

export const CITIES = [
  "Berlin",
  "Munich",
  "Hamburg",
  "Frankfurt",
  "Cologne",
  "Düsseldorf",
  "Stuttgart",
  "Leipzig",
  "Dresden",
  "Nuremberg",
  "Hannover",
  "Bremen",
  "Dortmund",
  "Essen",
] as const;

// EU member states + EEA (IS, LI, NO) + Switzerland: free movement, no residence permit needed.
export const EU_EEA_CH = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia",
  "Finland", "France", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy",
  "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Norway",
  "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland",
] as const;

export const NON_EU_COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia", "Azerbaijan",
  "Bangladesh", "Belarus", "Bosnia and Herzegovina", "Brazil", "Cameroon", "Canada", "Chile",
  "China", "Colombia", "Egypt", "Ethiopia", "Georgia", "Ghana", "India", "Indonesia", "Iran",
  "Iraq", "Israel", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kosovo", "Lebanon", "Malaysia",
  "Mexico", "Moldova", "Montenegro", "Morocco", "Nepal", "Nigeria", "North Macedonia", "Pakistan",
  "Peru", "Philippines", "Russia", "Saudi Arabia", "Serbia", "South Africa", "South Korea",
  "Sri Lanka", "Syria", "Taiwan", "Tunisia", "Turkey", "Ukraine", "United Kingdom",
  "United States", "Uzbekistan", "Venezuela", "Vietnam", "Other (non-EU)",
] as const;

export const ALL_NATIONALITIES: string[] = [...EU_EEA_CH, ...NON_EU_COUNTRIES].sort((a, b) =>
  a.startsWith("Other") ? 1 : b.startsWith("Other") ? -1 : a.localeCompare(b),
);

export function nationalityGroupFor(country: string): "EU" | "NON_EU" {
  return (EU_EEA_CH as readonly string[]).includes(country) ? "EU" : "NON_EU";
}

export const BIKE_KINDS = ["SERVICE", "REPAIR", "BATTERY", "INSPECTION", "INCIDENT"] as const;
