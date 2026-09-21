import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { isAdminRole, isOwnerRole, isStaffRole } from "./roles";

const SESSION_COOKIE = "nf_session";
const PENDING_COOKIE = "nf_pending";
const RIDER_SESSION_SECONDS = 60 * 60 * 24 * 7;
const STAFF_SESSION_SECONDS = 60 * 60 * 12;
const PENDING_SECONDS = 60 * 10;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

// The audience keeps the two token kinds apart: a "password OK, second factor pending" token
// can never be replayed as a full session.
async function sign(userId: string, audience: string, seconds: number, extra: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT(extra)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${seconds}s`)
    .sign(secret());
}

export async function createSession(userId: string, role: string): Promise<void> {
  const seconds = isStaffRole(role) ? STAFF_SESSION_SECONDS : RIDER_SESSION_SECONDS;
  (await cookies()).set(SESSION_COOKIE, await sign(userId, "session", seconds), cookieOptions(seconds));
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(PENDING_COOKIE);
}

export type PendingStage = "verify" | "enroll";

export async function createPendingLogin(userId: string, stage: PendingStage): Promise<void> {
  (await cookies()).set(PENDING_COOKIE, await sign(userId, "pending", PENDING_SECONDS, { stage }), cookieOptions(PENDING_SECONDS));
}

export async function readPendingLogin(): Promise<{ userId: string; stage: PendingStage } | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: "pending" });
    if (!payload.sub || (payload.stage !== "verify" && payload.stage !== "enroll")) return null;
    return { userId: payload.sub, stage: payload.stage };
  } catch {
    return null;
  }
}

export async function clearPendingLogin(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}

/** The role is read from the database on every request, so deactivating a user takes effect immediately. */
export const getSessionUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: "session" });
    if (!payload.sub) return null;
    const user = await db.user.findUnique({ where: { id: payload.sub }, include: { rider: true } });
    return user && user.active ? user : null;
  } catch {
    return null;
  }
});

/** Any signed-in user. Someone holding a temporary password is sent to change it before anything else. */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account");
  return user;
}

export async function requireRider() {
  const user = await requireUser();
  if (user.role !== "RIDER" || !user.rider) redirect("/admin");
  return { ...user, rider: user.rider };
}

export async function requireStaff() {
  const user = await getSessionUser();
  if (!user) redirect("/staff/login");
  if (!isStaffRole(user.role)) redirect("/apply");
  if (user.mustChangePassword) redirect("/account");
  return user;
}

/** Admin or owner: payroll, payslips, exports, audit log. */
export async function requireAdmin() {
  const user = await requireStaff();
  if (!isAdminRole(user.role)) redirect("/admin");
  return user;
}

/** Owner only: staff accounts and their two-factor settings. */
export async function requireOwner() {
  const user = await requireStaff();
  if (!isOwnerRole(user.role)) redirect("/admin");
  return user;
}

export function homeFor(role: string): string {
  return isStaffRole(role) ? "/admin" : "/apply";
}
