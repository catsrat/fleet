"use client";

import { useState } from "react";
import { reviewDocument } from "@/app/admin/actions";
import { ActionForm } from "./ActionForm";

interface Props {
  docId: string;
  checks: { id: string; text: string }[];
  expiry: "none" | "required" | "optional";
  expiryLabel?: string;
  defaultExpiry?: string;
  askWorkAuth: boolean;
  workAuthOptions: { value: string; label: string }[];
  currentWorkAuth?: string;
  reasons: { code: string; label: string }[];
}

export function ReviewForm(p: Props) {
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [ticked, setTicked] = useState<string[]>([]);
  const approve = decision === "approve";

  return (
    <ActionForm
      action={reviewDocument}
      submit={approve ? "Approve document" : "Reject document"}
      pendingLabel="Saving…"
      buttonClass={`btn w-full ${approve ? "btn-primary" : "btn-danger"}`}
      className="space-y-5"
    >
      <input type="hidden" name="docId" value={p.docId} />

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Decision">
        {(["approve", "reject"] as const).map((d) => (
          <label key={d} className={`cursor-pointer rounded-lg px-3 py-2 text-center text-sm font-semibold transition ${decision === d ? (d === "approve" ? "bg-white text-emerald-700 shadow-sm" : "bg-white text-rose-700 shadow-sm") : "text-slate-600"}`}>
            <input type="radio" name="decision" value={d} checked={decision === d} onChange={() => setDecision(d)} className="sr-only" />
            {d === "approve" ? "Approve" : "Reject"}
          </label>
        ))}
      </div>

      {approve ? (
        <>
          <fieldset>
            <legend className="mb-2 flex w-full items-center justify-between text-sm font-semibold text-slate-800">
              Verify
              <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setTicked(ticked.length === p.checks.length ? [] : p.checks.map((c) => c.id))}>
                {ticked.length === p.checks.length ? "Clear all" : "Tick all"}
              </button>
            </legend>
            <ul className="space-y-2">
              {p.checks.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="check"
                      value={c.id}
                      checked={ticked.includes(c.id)}
                      onChange={(e) => setTicked(e.target.checked ? [...ticked, c.id] : ticked.filter((x) => x !== c.id))}
                      className="mt-0.5 h-4 w-4 accent-brand-600"
                    />
                    <span>{c.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          {p.expiry !== "none" && (
            <div>
              <label className="label" htmlFor="expiresAt">
                {p.expiryLabel} {p.expiry === "required" ? <span className="text-rose-600">*</span> : <span className="text-slate-400">(optional)</span>}
              </label>
              <input id="expiresAt" name="expiresAt" type="date" defaultValue={p.defaultExpiry} className="input" required={p.expiry === "required"} />
            </div>
          )}

          {p.askWorkAuth && (
            <div>
              <label className="label" htmlFor="workAuthorization">Work authorization shown on the permit</label>
              <select id="workAuthorization" name="workAuthorization" defaultValue={p.currentWorkAuth ?? ""} className="input">
                <option value="">Select…</option>
                {p.workAuthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="help">Non-EU students with a §16b permit are usually limited to 140 full / 280 half days per year.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div>
            <label className="label" htmlFor="reasonCode">Reason shown to the rider</label>
            <select id="reasonCode" name="reasonCode" defaultValue="" className="input" required>
              <option value="" disabled>Select a reason…</option>
              {p.reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="note">Note to the rider <span className="text-slate-400">(optional)</span></label>
            <textarea id="note" name="note" rows={3} maxLength={400} className="input" placeholder="e.g. Please retake the photo in daylight." />
          </div>
        </>
      )}
    </ActionForm>
  );
}
