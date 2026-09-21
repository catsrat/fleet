import { db } from "./db";
import { dayStatus, eligibility, loadHoursByRider } from "./compliance";

const LIVE_STATUSES = ["APPROVED", "UBER_ONBOARDING", "ACTIVE", "SUSPENDED"];

/** Work-eligibility and day-limit picture for every rider who is (or is about to be) on the road. */
export async function loadComplianceRows() {
  const riders = await db.rider.findMany({
    where: { status: { in: LIVE_STATUSES } },
    include: { documents: { where: { status: { not: "SUPERSEDED" } } } },
    orderBy: { lastName: "asc" },
  });
  const hours = await loadHoursByRider(riders.map((r) => r.id));
  return riders.map((rider) => {
    const days = dayStatus(rider, hours.get(rider.id) ?? []);
    return { rider, days, elig: eligibility(rider, rider.documents, days) };
  });
}

export type ComplianceRow = Awaited<ReturnType<typeof loadComplianceRows>>[number];
