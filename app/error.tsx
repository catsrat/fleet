"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page throws. The digest is Next's own identifier, which matches the server log entry. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[client] page error:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="card max-w-md p-6 text-center sm:p-8">
        <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          The page could not be loaded. Nothing you entered has been lost — try again, and if it keeps happening tell our team.
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs text-slate-400">Reference: {error.digest}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="btn btn-primary">Try again</button>
          <Link href="/" className="btn btn-secondary">Go to the start page</Link>
        </div>
      </div>
    </div>
  );
}
