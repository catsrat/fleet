"use client";

import { useState, useTransition } from "react";
import { confirmEnrollment, finishEnrollment } from "@/app/staff/actions";

export function EnrollForm({ qr, secret }: { qr: string; secret: string }) {
  const [error, setError] = useState<string>();
  const [codes, setCodes] = useState<string[]>();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  if (codes) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Save your recovery codes</h1>
        <p className="mt-1 text-sm text-slate-600">
          Each code works once if you lose your phone. They are shown <strong>only now</strong> — store them in a password manager or print them.
        </p>
        <ul className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-4 font-mono text-sm">
          {codes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>Copy all</button>
        <label className="mt-5 flex items-start gap-2.5 text-sm text-slate-700">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 accent-brand-600" />
          <span>I have saved these codes somewhere safe.</span>
        </label>
        <button
          type="button"
          className="btn btn-primary mt-5 w-full"
          disabled={!saved || pending}
          onClick={() =>
            start(async () => {
              try {
                await finishEnrollment();
              } catch (err) {
                const digest = (err as { digest?: string })?.digest;
                if (!(typeof digest === "string" && digest.startsWith("NEXT_REDIRECT"))) setError("Something went wrong. Please sign in again.");
              }
            })
          }
        >
          {pending ? "Opening…" : "Continue to the dashboard"}
        </button>
        {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Set up two-factor sign-in</h1>
      <p className="mt-1 text-sm text-slate-600">Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL generated on the server */}
      <img src={qr} alt="QR code to add Nucleus Fleet to your authenticator app" width={220} height={220} className="mx-auto mt-5 rounded-xl border border-slate-200" />
      <p className="mt-3 text-center text-xs text-slate-500">Can&apos;t scan? Enter this key manually:</p>
      <p className="mt-1 select-all break-all text-center font-mono text-sm font-semibold tracking-wider">{secret}</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          const fd = new FormData(e.currentTarget);
          start(async () => {
            try {
              const res = await confirmEnrollment(fd);
              if (res.error) setError(res.error);
              else if (res.codes) setCodes(res.codes);
            } catch (err) {
              const digest = (err as { digest?: string })?.digest;
              if (!(typeof digest === "string" && digest.startsWith("NEXT_REDIRECT"))) setError("Something went wrong. Please try again.");
            }
          });
        }}
      >
        <div>
          <label className="label" htmlFor="code">Enter the 6-digit code from the app</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={7} className="input text-center font-mono text-lg tracking-widest" />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Turn on and continue"}</button>
        {error && <p role="alert" className="text-sm font-medium text-rose-600">{error}</p>}
      </form>
    </div>
  );
}
