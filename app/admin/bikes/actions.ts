"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { BIKE_KINDS } from "@/lib/constants";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { parseDateInput } from "@/lib/validators";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const cents = (fd: FormData, name: string): number | null => {
  const raw = text(fd, name).replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

async function staff() {
  const user = await requireStaff();
  return { actor: { id: user.id, name: user.name } };
}

async function nextCode(): Promise<string> {
  const last = await db.bike.findFirst({ where: { code: { startsWith: "NF-" } }, orderBy: { code: "desc" }, select: { code: true } });
  const n = last ? Number(last.code.slice(3)) + 1 : 1;
  return `NF-${String(Number.isFinite(n) ? n : 1).padStart(3, "0")}`;
}

export async function createBike(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const make = text(fd, "make");
  const model = text(fd, "model");
  const frameNumber = text(fd, "frameNumber").toUpperCase();
  const motorWatts = Number(text(fd, "motorWatts") || 250);
  const maxAssistKmh = Number(text(fd, "maxAssistKmh") || 25);
  if (!make || !model || !frameNumber) return { error: "Make, model and frame number are required." };
  if (!Number.isFinite(motorWatts) || !Number.isFinite(maxAssistKmh)) return { error: "Motor power and assist speed must be numbers." };
  if (motorWatts > 250 || maxAssistKmh > 25) {
    return { error: "Only pedelecs (max. 250 W, assist up to 25 km/h) are allowed. S-Pedelecs need a licence, insurance plate and helmet — not a bicycle courier vehicle." };
  }
  if (await db.bike.findUnique({ where: { frameNumber } })) return { error: "A bike with this frame number already exists." };

  const code = text(fd, "code").toUpperCase() || (await nextCode());
  if (await db.bike.findUnique({ where: { code } })) return { error: `Fleet code ${code} is already used.` };

  const bike = await db.bike.create({
    data: {
      code, make, model, frameNumber, motorWatts, maxAssistKmh,
      batterySerial: text(fd, "batterySerial") || null,
      purchaseDate: parseDateInput(fd.get("purchaseDate")),
      insuranceUntil: parseDateInput(fd.get("insuranceUntil")),
      nextServiceDue: parseDateInput(fd.get("nextServiceDue")),
      notes: text(fd, "notes") || null,
    },
  });
  await audit({ actor, action: "BIKE_CREATED", entityType: "Bike", entityId: bike.id, meta: { code } });
  revalidatePath("/admin/bikes");
  redirect(`/admin/bikes/${bike.id}`);
}

export async function updateBike(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const id = text(fd, "bikeId");
  await db.bike.update({
    where: { id },
    data: {
      insuranceUntil: parseDateInput(fd.get("insuranceUntil")),
      nextServiceDue: parseDateInput(fd.get("nextServiceDue")),
      batterySerial: text(fd, "batterySerial") || null,
      notes: text(fd, "notes") || null,
    },
  });
  await audit({ actor, action: "BIKE_UPDATED", entityType: "Bike", entityId: id });
  revalidatePath(`/admin/bikes/${id}`);
  return { ok: true, message: "Saved." };
}

export async function assignBike(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const bike = await db.bike.findUnique({ where: { id: text(fd, "bikeId") } });
  const rider = await db.rider.findUnique({ where: { id: text(fd, "riderId") } });
  if (!bike || !rider) return { error: "Choose a rider." };
  if (bike.status !== "AVAILABLE") return { error: "This bike is not available." };
  if (!["APPROVED", "UBER_ONBOARDING", "ACTIVE"].includes(rider.status)) return { error: "Only approved riders can receive a bike." };
  if (await db.bikeAssignment.count({ where: { riderId: rider.id, returnedAt: null } })) return { error: "This rider already has a bike." };

  await db.$transaction([
    db.bikeAssignment.create({ data: { bikeId: bike.id, riderId: rider.id, conditionOut: text(fd, "conditionOut") || null, depositCents: cents(fd, "deposit") } }),
    db.bike.update({ where: { id: bike.id }, data: { status: "ASSIGNED" } }),
  ]);
  await audit({ actor, action: "BIKE_ASSIGNED", entityType: "Bike", entityId: bike.id, riderId: rider.id, meta: { code: bike.code } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Assigned." };
}

export async function returnBike(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const assignment = await db.bikeAssignment.findUnique({ where: { id: text(fd, "assignmentId") }, include: { bike: true } });
  if (!assignment || assignment.returnedAt) return { error: "Assignment not found." };
  const needsService = fd.get("needsService") === "on";
  await db.$transaction([
    db.bikeAssignment.update({ where: { id: assignment.id }, data: { returnedAt: new Date(), conditionIn: text(fd, "conditionIn") || null } }),
    db.bike.update({ where: { id: assignment.bikeId }, data: { status: needsService ? "MAINTENANCE" : "AVAILABLE" } }),
  ]);
  await audit({ actor, action: "BIKE_RETURNED", entityType: "Bike", entityId: assignment.bikeId, riderId: assignment.riderId, meta: { code: assignment.bike.code, needsService } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Returned." };
}

export async function addMaintenance(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const bikeId = text(fd, "bikeId");
  const kind = text(fd, "kind");
  const date = parseDateInput(fd.get("date"));
  if (!(BIKE_KINDS as readonly string[]).includes(kind) || !date) return { error: "Choose a type and date." };
  const nextServiceDue = parseDateInput(fd.get("nextServiceDue"));
  await db.$transaction([
    db.maintenanceLog.create({ data: { bikeId, date, kind, costCents: cents(fd, "cost"), note: text(fd, "note").slice(0, 400) || null, createdByName: actor.name } }),
    ...(nextServiceDue ? [db.bike.update({ where: { id: bikeId }, data: { nextServiceDue } })] : []),
  ]);
  await audit({ actor, action: "BIKE_MAINTENANCE", entityType: "Bike", entityId: bikeId, meta: { kind } });
  revalidatePath(`/admin/bikes/${bikeId}`);
  return { ok: true, message: "Logged." };
}

export async function setBikeStatus(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const bike = await db.bike.findUnique({ where: { id: text(fd, "bikeId") } });
  const status = text(fd, "status");
  if (!bike) return { error: "Bike not found." };
  if (!["AVAILABLE", "MAINTENANCE", "RETIRED"].includes(status)) return { error: "Invalid status." };
  if (bike.status === "ASSIGNED") return { error: "Return the bike from its rider first." };
  await db.bike.update({ where: { id: bike.id }, data: { status } });
  await audit({ actor, action: `BIKE_${status}`, entityType: "Bike", entityId: bike.id, meta: { code: bike.code } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Updated." };
}
