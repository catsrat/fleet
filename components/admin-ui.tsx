import { STATUS_LABEL, STATUS_TONE, type RiderStatus } from "@/lib/constants";
import type { DocState } from "@/lib/rider";

export function StatusBadge({ status }: { status: string }) {
  const s = status as RiderStatus;
  return <span className={`chip ${STATUS_TONE[s] ?? "bg-slate-100 text-slate-700"}`}>{STATUS_LABEL[s] ?? status}</span>;
}

const DOC_TONE: Record<DocState, string> = {
  MISSING: "bg-slate-100 text-slate-600",
  PENDING_REVIEW: "bg-sky-100 text-sky-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-amber-100 text-amber-900",
  EXPIRED: "bg-rose-100 text-rose-800",
};
const DOC_LABEL: Record<DocState, string> = {
  MISSING: "Missing",
  PENDING_REVIEW: "Needs review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

export function DocBadge({ state }: { state: DocState }) {
  return <span className={`chip ${DOC_TONE[state]}`}>{DOC_LABEL[state]}</span>;
}

const BIKE_TONE: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800",
  ASSIGNED: "bg-indigo-100 text-indigo-800",
  MAINTENANCE: "bg-amber-100 text-amber-900",
  RETIRED: "bg-slate-200 text-slate-600",
};

export function BikeStatus({ status }: { status: string }) {
  return <span className={`chip ${BIKE_TONE[status] ?? ""}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: number | string; hint?: string; tone?: "default" | "warn" | "good" }) {
  const color = tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  return (
    <div className="card p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-500">{children}</p>;
}

export function ProgressBar({ pct, level }: { pct: number; level: "ok" | "warn" | "exceeded" | "na" }) {
  const color = level === "exceeded" ? "bg-rose-500" : level === "warn" ? "bg-amber-500" : "bg-brand-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
