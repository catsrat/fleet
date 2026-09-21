"use client";

import { useEffect, useState, useTransition } from "react";
import { revealPayroll, type PayrollReveal } from "@/app/admin/actions";

export function RevealPayroll({ riderId }: { riderId: string }) {
  const [data, setData] = useState<PayrollReveal | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!data || data.error) return;
    const timer = setTimeout(() => setData(null), 30_000);
    return () => clearTimeout(timer);
  }, [data]);

  if (!data) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => setData(await revealPayroll(riderId)))}>
        {pending ? "Decrypting…" : "Reveal full values (logged)"}
      </button>
    );
  }
  if (data.error) return <p className="text-sm font-medium text-rose-600">{data.error}</p>;

  return (
    <div className="space-y-2 rounded-xl bg-amber-50 p-4 text-sm">
      <p className="text-xs font-medium text-amber-800">Visible for 30 seconds. This access was logged.</p>
      <dl className="space-y-1 font-mono">
        <div><dt className="inline text-slate-500">Tax ID: </dt><dd className="inline">{data.taxId ?? "—"}</dd></div>
        <div><dt className="inline text-slate-500">SV no.: </dt><dd className="inline">{data.svNumber ?? "—"}</dd></div>
        <div><dt className="inline text-slate-500">IBAN: </dt><dd className="inline">{data.iban ?? "—"}</dd></div>
      </dl>
      <button type="button" className="text-xs font-medium text-amber-900 underline" onClick={() => setData(null)}>Hide now</button>
    </div>
  );
}
