import { db } from "./db";

export const STAFF_ROLES = ["OWNER", "ADMIN", "REVIEWER"] as const;

/** True once any staff account exists. The first-run setup page is unreachable from then on. */
export async function ownerExists(): Promise<boolean> {
  return (await db.user.count({ where: { role: { in: [...STAFF_ROLES] } } })) > 0;
}

export const setupEnabled = (): boolean => !!process.env.SETUP_TOKEN?.trim();
