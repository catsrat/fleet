"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { mergeSlots, parseTime, validateSlot, validateWeek } from "@/lib/availability";
import { CAN_SET_AVAILABILITY } from "@/lib/constants";
import { db } from "@/lib/db";
import { getLocale, tr } from "@/lib/locale";
import { requireRider } from "@/lib/session";

async function ctx() {
  const user = await requireRider();
  return { rider: user.rider, actor: { id: user.id, name: user.name }, locale: await getLocale() };
}

const notAllowed = (locale: "en" | "de"): FormState => ({
  error: tr(locale, "You can set your availability once your application is approved.", "Du kannst deine Verfügbarkeit eintragen, sobald deine Bewerbung freigegeben ist."),
});

/** Adds hours to the chosen days, merging with what is already there, and re-checks the whole week against the legal limits. */
export async function addSlots(fd: FormData): Promise<FormState> {
  const { rider, actor, locale } = await ctx();
  if (!CAN_SET_AVAILABILITY.includes(rider.status)) return notAllowed(locale);

  const days = [...new Set(fd.getAll("day").map((v) => Number(v)))];
  const startMinute = parseTime(String(fd.get("start") ?? ""));
  const endMinute = parseTime(String(fd.get("end") ?? ""));
  if (!days.length) return { error: tr(locale, "Choose at least one day.", "Wähle mindestens einen Tag.") };
  if (startMinute === null || endMinute === null || endMinute <= startMinute) {
    return { error: tr(locale, "Choose a start time that is before the end time.", "Wähle eine Startzeit vor der Endzeit.") };
  }
  const additions = days.map((weekday) => ({ weekday, startMinute, endMinute }));
  const slotError = additions.map(validateSlot).find(Boolean);
  if (slotError) {
    return { error: tr(locale, slotError, "Zeiträume müssen zwischen 06:00 und 24:00 liegen und mindestens 1 Stunde dauern.") };
  }

  const existing = await db.availabilitySlot.findMany({ where: { riderId: rider.id }, select: { weekday: true, startMinute: true, endMinute: true } });
  const merged = mergeSlots([...existing, ...additions]);
  const weekError = validateWeek(merged, locale);
  if (weekError) return { error: weekError };

  await db.$transaction([
    db.availabilitySlot.deleteMany({ where: { riderId: rider.id } }),
    db.availabilitySlot.createMany({ data: merged.map((s) => ({ ...s, riderId: rider.id })) }),
  ]);
  await audit({ actor, action: "AVAILABILITY_UPDATED", entityType: "Rider", entityId: rider.id, riderId: rider.id, meta: { added: additions.length } });
  revalidatePath("/apply/availability");
  return { ok: true, message: tr(locale, "Saved.", "Gespeichert.") };
}

export async function removeSlot(fd: FormData): Promise<void> {
  const { rider, actor } = await ctx();
  const removed = await db.availabilitySlot.deleteMany({ where: { id: String(fd.get("id") ?? ""), riderId: rider.id } });
  if (removed.count) await audit({ actor, action: "AVAILABILITY_UPDATED", entityType: "Rider", entityId: rider.id, riderId: rider.id, meta: { removed: 1 } });
  revalidatePath("/apply/availability");
}

export async function clearSlots(): Promise<void> {
  const { rider, actor } = await ctx();
  await db.availabilitySlot.deleteMany({ where: { riderId: rider.id } });
  await audit({ actor, action: "AVAILABILITY_CLEARED", entityType: "Rider", entityId: rider.id, riderId: rider.id });
  revalidatePath("/apply/availability");
}
