import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/admin-ui";
import { db } from "@/lib/db";
import { fmtDateTime, humanize } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; views?: string; action?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const showViews = sp.views === "1";
  const where = {
    ...(showViews ? {} : { action: { notIn: ["DOCUMENT_VIEWED", "PAYSLIP_VIEWED"] } }),
    ...(sp.action ? { action: { contains: sp.action.toUpperCase() } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { at: "desc" }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    db.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number, views = showViews) => `/admin/audit?page=${p}${views ? "&views=1" : ""}${sp.action ? `&action=${encodeURIComponent(sp.action)}` : ""}`;

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every review decision, status change and access to personal data. Entries cannot be edited."
        actions={<Link href={link(1, !showViews)} className="btn btn-secondary btn-sm">{showViews ? "Hide document views" : "Show document views"}</Link>}
      />
      <form className="mb-4 flex gap-3" role="search">
        <input name="action" defaultValue={sp.action} placeholder="Filter by action, e.g. REJECTED" className="input max-w-xs" aria-label="Filter by action" />
        {showViews && <input type="hidden" name="views" value="1" />}
        <button className="btn btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No entries.</Empty>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-slate-100"><tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">Details</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-slate-50">
                  <td className="td whitespace-nowrap tabular-nums">{fmtDateTime(r.at)}</td>
                  <td className="td">{r.actorName ?? "System"}</td>
                  <td className="td font-medium text-slate-900">{humanize(r.action)}</td>
                  <td className="td text-xs text-slate-500">
                    {r.riderId ? <Link href={`/admin/riders/${r.riderId}`} className="font-medium text-brand-700 hover:underline">Open rider</Link> : r.entityType}
                    {r.meta && <span className="ml-2 break-all font-mono">{r.meta.length > 120 ? `${r.meta.slice(0, 120)}…` : r.meta}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={link(page - 1)} className="btn btn-secondary btn-sm">← Newer</Link> : <span />}
          <span className="text-slate-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={link(page + 1)} className="btn btn-secondary btn-sm">Older →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
