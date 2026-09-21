import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Stat, StatusBadge } from "@/components/admin-ui";
import { loadComplianceRows } from "@/lib/compliance-data";
import { RIDER_STATUSES, STATUS_LABEL } from "@/lib/constants";
import { db } from "@/lib/db";
import { DOC_SPECS, type DocType } from "@/lib/documents";
import { timeAgo } from "@/lib/format";
import { fullName } from "@/lib/rider";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [statusGroups, pendingDocs, pendingCount, bikeGroups, deletionRequests, compliance] = await Promise.all([
    db.rider.groupBy({ by: ["status"], _count: { _all: true } }),
    db.document.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: { uploadedAt: "asc" }, take: 6, include: { rider: { select: { id: true, firstName: true, lastName: true } } } }),
    db.document.count({ where: { status: "PENDING_REVIEW" } }),
    db.bike.groupBy({ by: ["status"], _count: { _all: true } }),
    db.rider.findMany({ where: { deletionRequestedAt: { not: null } }, select: { id: true, firstName: true, lastName: true, deletionRequestedAt: true }, take: 5 }),
    loadComplianceRows(),
  ]);

  const count = (s: string) => statusGroups.find((g) => g.status === s)?._count._all ?? 0;
  const bikes = (s: string) => bikeGroups.find((g) => g.status === s)?._count._all ?? 0;
  const inReview = count("SUBMITTED") + count("IN_REVIEW");
  const max = Math.max(1, ...RIDER_STATUSES.map(count));
  const oldest = pendingDocs[0]?.uploadedAt;

  const attention = compliance
    .filter((c) => ["ACTIVE", "UBER_ONBOARDING", "APPROVED"].includes(c.rider.status) && (c.elig.reasons.length || c.elig.warnings.length))
    .sort((a, b) => b.elig.reasons.length - a.elig.reasons.length || b.elig.warnings.length - a.elig.warnings.length)
    .slice(0, 6);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Onboarding pipeline, compliance and fleet at a glance." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Documents to review" value={pendingCount} hint={oldest ? `Oldest waiting ${timeAgo(oldest)}` : "Queue is clear"} tone={pendingCount ? "warn" : "good"} />
        <Stat label="Applicants in review" value={inReview} hint={`${count("CHANGES_REQUESTED")} waiting on the rider`} />
        <Stat label="Approved, awaiting Uber" value={count("APPROVED") + count("UBER_ONBOARDING")} hint="Ready for Uber activation" />
        <Stat label="Active riders" value={count("ACTIVE")} tone="good" hint={`${bikes("ASSIGNED")} of ${bikes("AVAILABLE") + bikes("ASSIGNED") + bikes("MAINTENANCE")} e-bikes deployed`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Oldest documents waiting</h2>
            <Link href="/admin/review" className="text-sm font-medium text-brand-700 hover:underline">Open queue</Link>
          </div>
          {pendingDocs.length === 0 ? (
            <Empty>Nothing to review — nice work.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pendingDocs.map((d) => (
                <li key={d.id}>
                  <Link href={`/admin/riders/${d.rider.id}/docs/${d.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{fullName(d.rider)}</p>
                      <p className="truncate text-xs text-slate-500">{DOC_SPECS[d.type as DocType].en.label}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-slate-500">{timeAgo(d.uploadedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Needs attention</h2>
            <Link href="/admin/compliance" className="text-sm font-medium text-brand-700 hover:underline">Compliance</Link>
          </div>
          {attention.length === 0 && deletionRequests.length === 0 ? (
            <Empty>No expiring documents or day-limit warnings.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {deletionRequests.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/riders/${r.id}`} className="block px-5 py-3 hover:bg-slate-50">
                    <p className="text-sm font-medium">{fullName(r)}</p>
                    <p className="text-xs font-medium text-rose-600">Requested deletion of their data</p>
                  </Link>
                </li>
              ))}
              {attention.map(({ rider, elig }) => (
                <li key={rider.id}>
                  <Link href={`/admin/riders/${rider.id}`} className="block px-5 py-3 hover:bg-slate-50">
                    <p className="text-sm font-medium">{fullName(rider)}</p>
                    {elig.reasons.map((r) => <p key={r} className="text-xs font-medium text-rose-600">{r}</p>)}
                    {elig.warnings.map((w) => <p key={w} className="text-xs text-amber-700">{w}</p>)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-6">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Pipeline</h2>
        </div>
        <ul className="space-y-3 p-5">
          {RIDER_STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-4">
              <Link href={`/admin/riders?status=${s}`} className="w-40 shrink-0"><StatusBadge status={s} /></Link>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${(count(s) / max) * 100}%` }} title={STATUS_LABEL[s]} />
              </div>
              <span className="w-8 text-right text-sm font-semibold tabular-nums">{count(s)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
