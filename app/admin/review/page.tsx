import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/admin-ui";
import { db } from "@/lib/db";
import { DOC_SPECS, DOC_TYPES, type DocType } from "@/lib/documents";
import { timeAgo } from "@/lib/format";
import { fullName } from "@/lib/rider";

export const metadata: Metadata = { title: "Review queue" };

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const filter = DOC_TYPES.includes(type as DocType) ? (type as DocType) : undefined;
  const docs = await db.document.findMany({
    where: { status: "PENDING_REVIEW", ...(filter ? { type: filter } : {}) },
    orderBy: { uploadedAt: "asc" },
    include: { rider: { select: { id: true, firstName: true, lastName: true, city: true, nationalityGroup: true, status: true } } },
    take: 200,
  });

  return (
    <>
      <PageHeader title="Review queue" subtitle="Oldest first. Open a document to compare it with the applicant's details and approve or reject it." />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/review" className={`chip ${!filter ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>All</Link>
        {DOC_TYPES.map((t) => (
          <Link key={t} href={`/admin/review?type=${t}`} className={`chip ${filter === t ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>
            {DOC_SPECS[t].en.label.split(" (")[0]}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {docs.length === 0 ? (
          <Empty>No documents are waiting for review.</Empty>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-slate-100">
              <tr>
                <th className="th">Applicant</th>
                <th className="th">Document</th>
                <th className="th">City</th>
                <th className="th">Waiting</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="td font-medium text-slate-900">
                    {fullName(d.rider)}
                    {d.rider.nationalityGroup === "NON_EU" && <span className="chip ml-2 bg-amber-100 text-amber-800">Non-EU</span>}
                    {d.rider.status === "ACTIVE" && <span className="chip ml-2 bg-emerald-100 text-emerald-800">Renewal</span>}
                  </td>
                  <td className="td">{DOC_SPECS[d.type as DocType].en.label}</td>
                  <td className="td">{d.rider.city}</td>
                  <td className="td tabular-nums">{timeAgo(d.uploadedAt)}</td>
                  <td className="td text-right">
                    <Link href={`/admin/riders/${d.rider.id}/docs/${d.id}`} className="btn btn-primary btn-sm">Review</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
