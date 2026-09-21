"use client";

import { useState, useTransition } from "react";
import { regenerateRecoveryCodes } from "@/app/account/actions";

export function RecoveryCodes({ remaining }: { remaining: number }) {
  const [codes, setCodes] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <div>
      <p className="text-sm text-slate-600">
        {remaining} unused recovery {remaining === 1 ? "code" : "codes"} left. Each works once if you lose your phone.
      </p>
      {codes ? (
        <>
          <p className="mt-3 text-sm font-medium text-amber-800">New codes — shown only now. Your old codes no longer work.</p>
          <ul className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-4 font-mono text-sm">
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>Copy all</button>
        </>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(undefined);
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const res = await regenerateRecoveryCodes(fd);
              if (res.error) setError(res.error);
              else if (res.codes) setCodes(res.codes);
            });
          }}
        >
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="rc-password">Password</label>
            <input id="rc-password" name="password" type="password" autoComplete="current-password" required className="input" />
          </div>
          <button className="btn btn-secondary" disabled={pending}>{pending ? "Working…" : "Generate new codes"}</button>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-rose-600">{error}</p>}
    </div>
  );
}
