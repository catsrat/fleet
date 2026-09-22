"use client";

import { useEffect } from "react";

/** Last line of defence: replaces the whole document, so it carries its own html and body. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[client] fatal error:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f8fa", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#0f172a" }}>
        <div style={{ maxWidth: 420, padding: 28, textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14 }}>
          <h1 style={{ margin: "0 0 10px", fontSize: 20 }}>Something went wrong</h1>
          <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.6, color: "#475569" }}>
            The application could not start. Please try again in a moment.
          </p>
          {error.digest && <p style={{ margin: "0 0 18px", fontSize: 12, color: "#94a3b8" }}>Reference: {error.digest}</p>}
          <button type="button" onClick={reset} style={{ background: "#0b8a7e", color: "#fff", border: 0, borderRadius: 8, padding: "11px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
