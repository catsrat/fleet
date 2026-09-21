import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Empty, PageHeader, StatusBadge } from "@/components/admin-ui";
import { CITIES, RIDER_STATUSES, STATUS_LABEL } from "@/lib/constants";
import { db } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { evaluate, fullName } from "@/lib/rider";
import { isAdminRole } from "@/lib/roles";
import { requireStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Riders" };

const PAGE_SIZE = 25;
type Params = { q?: string; status?: string; city?: string; group?: string; page?: string };

export default async function RidersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.RiderWhereInput = {
    ...(sp.status && (RIDER_STATUSES as readonly string[]).includes(sp.status) ? { status: sp.status } : {}),
    ...(sp.city && (CITIES as readonly string[]).includes(sp.city) ? { city: sp.city } : {}),
    ...(sp.group === "EU" || sp.group === "NON_EU" ? { nationalityGroup: sp.group } : {}),
    ...(q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { university: { contains: q } }, { user: { email: { contains: q } } }] } : {}),
  };

  const [riders, total] = await Promise.all([
    db.rider.findMany({
      where,
      include: { user: { select: { email: true } }, documents: { where: { status: { not: "SUPERSEDED" } } } },
      orderBy: [{ submittedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.rider.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: String(p) })) if (v) u.set(k, v);
    return `/admin/riders?${u.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Riders"
        subtitle={`${total} ${total === 1 ? "rider" : "riders"}`}
        actions={
          <div className="flex gap-2">
            <a href="/api/admin/export/riders" className="btn btn-secondary btn-sm">Export roster</a>
            {isAdminRole(viewer.role) && <a href="/api/admin/export/payroll" className="btn btn-secondary btn-sm">Export payroll data</a>}
          </div>
        }
      />

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]" role="search">
        <input name="q" defaultValue={q} placeholder="Search name, email or university" className="input" aria-label="Search" />
        <select name="status" defaultValue={sp.status ?? ""} className="input" aria-label="Status">
          <option value="">All statuses</option>
          {RIDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select name="city" defaultValue={sp.city ?? ""} className="input" aria-label="City">
          <option value="">All cities</option>
          {CITIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select name="group" defaultValue={sp.group ?? ""} className="input" aria-label="Nationality group">
          <option value="">EU and non-EU</option>
          <option value="EU">EU / EEA / CH</option>
          <option value="NON_EU">Non-EU</option>
        </select>
        <button className="btn btn-primary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {riders.length === 0 ? (
          <Empty>No riders match these filters.</Empty>
        ) : (
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-slate-100">
              <tr>
                <th className="th">Rider</th>
                <th className="th">City</th>
                <th className="th">Status</th>
                <th className="th">Documents</th>
                <th className="th">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {riders.map((r) => {
                const ev = evaluate(r, r.documents);
                const approved = ev.required.filter((t) => ev.states[t] === "APPROVED").length;
                const review = ev.pending.length;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link href={`/admin/riders/${r.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{fullName(r)}</Link>
                      {r.nationalityGroup === "NON_EU" && <span className="chip ml-2 bg-amber-100 text-amber-800">Non-EU</span>}
                      <p className="text-xs text-slate-500">{r.user.email}</p>
                    </td>
                    <td className="td">{r.city}</td>
                    <td className="td"><StatusBadge status={r.status} /></td>
                    <td className="td">
                      <span className="font-medium tabular-nums">{approved}/{ev.required.length}</span> approved
                      {review > 0 && <span className="chip ml-2 bg-sky-100 text-sky-800">{review} to review</span>}
                      {ev.rejected.length > 0 && <span className="chip ml-2 bg-amber-100 text-amber-900">{ev.rejected.length} rejected</span>}
                    </td>
                    <td className="td tabular-nums">{fmtDay(r.submittedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={link(page - 1)} className="btn btn-secondary btn-sm">← Previous</Link> : <span />}
          <span className="text-slate-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={link(page + 1)} className="btn btn-secondary btn-sm">Next →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
