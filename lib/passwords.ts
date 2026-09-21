import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

export const BCRYPT_COST = 12;

// Compared against when the account is unknown, so response time never reveals which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("nucleus-fleet-dummy", BCRYPT_COST);

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, BCRYPT_COST);

export const checkPassword = (password: string, hash: string | null | undefined): Promise<boolean> =>
  bcrypt.compare(password, hash ?? DUMMY_HASH);

/** An unguessable hash for accounts that sign in with Google and have no password of their own. */
export const unusablePasswordHash = (): Promise<string> => hashPassword(randomBytes(32).toString("hex"));

/** 16 chars mixing letters and digits, so it always passes the password policy. */
export function temporaryPassword(): string {
  const body = randomBytes(12).toString("base64url").replace(/[-_]/g, "x");
  return `${body.slice(0, 12)}a7Q9`;
}
