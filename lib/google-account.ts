import type { User } from "@prisma/client";
import { audit } from "./audit";
import { db } from "./db";
import type { GoogleProfile } from "./google";
import { unusablePasswordHash } from "./passwords";

export type GoogleResolution = { ok: true; user: User; created: boolean } | { ok: false; reason: "staff" | "inactive" | "conflict" };

/**
 * Maps a verified Google identity to a rider account: returning user, an existing password account
 * that gets linked, or a brand-new rider. Staff accounts are never reachable this way.
 */
export async function resolveGoogleUser(profile: GoogleProfile, locale: "en" | "de"): Promise<GoogleResolution> {
  const bySub = await db.user.findUnique({ where: { googleSub: profile.sub } });
  if (bySub) return bySub.role === "RIDER" && bySub.active ? { ok: true, user: bySub, created: false } : { ok: false, reason: bySub.active ? "staff" : "inactive" };

  const byEmail = await db.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    if (byEmail.role !== "RIDER") return { ok: false, reason: "staff" };
    if (!byEmail.active) return { ok: false, reason: "inactive" };
    if (byEmail.googleSub) return { ok: false, reason: "conflict" }; // this email is already tied to a different Google account

    // Google has verified this address, so its holder is the rightful owner. The password on the existing
    // account may have been set by someone who registered with an email they did not control, so it is
    // replaced: from now on this rider signs in with Google (an admin can issue a temporary password).
    const user = await db.user.update({
      where: { id: byEmail.id },
      data: { googleSub: profile.sub, emailVerifiedAt: new Date(), passwordHash: await unusablePasswordHash(), mustChangePassword: false },
    });
    await audit({ actor: { id: user.id, name: user.name }, action: "GOOGLE_LINKED", entityType: "User", entityId: user.id });
    return { ok: true, user, created: false };
  }

  const fallbackFirst = profile.name?.split(" ")[0] ?? profile.email.split("@")[0];
  const firstName = profile.givenName ?? fallbackFirst;
  const lastName = profile.familyName ?? (profile.name?.split(" ").slice(1).join(" ") || "–");
  const user = await db.user.create({
    data: {
      email: profile.email,
      name: `${firstName} ${lastName}`.trim(),
      role: "RIDER",
      locale,
      googleSub: profile.sub,
      emailVerifiedAt: new Date(),
      passwordHash: await unusablePasswordHash(),
      rider: { create: { firstName, lastName } },
    },
    include: { rider: true },
  });
  await audit({
    actor: { id: user.id, name: user.name }, action: "RIDER_REGISTERED", entityType: "Rider", entityId: user.rider!.id, riderId: user.rider!.id, meta: { via: "google" },
  });
  return { ok: true, user, created: true };
}
