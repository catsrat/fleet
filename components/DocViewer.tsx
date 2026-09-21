"use client";

import { useState } from "react";

export function DocViewer({ src, mime, title }: { src: string; mime: string; title: string }) {
  const [rotation, setRotation] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  if (mime === "application/pdf") {
    return <iframe src={src} title={title} className="h-[75vh] w-full rounded-xl border border-slate-200 bg-white" />;
  }

  const sideways = rotation % 180 !== 0;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRotation((r) => (r + 270) % 360)} aria-label="Rotate left">↺ Rotate</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="Rotate right">↻ Rotate</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setZoomed((z) => !z)} aria-pressed={zoomed}>{zoomed ? "Fit to screen" : "Zoom in"}</button>
        <a href={src} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">Open in new tab ↗</a>
      </div>
      <div className={`flex items-center justify-center overflow-auto rounded-xl border border-slate-200 bg-slate-100 ${zoomed ? "max-h-[75vh]" : "h-[70vh]"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, decrypted stream; next/image cannot proxy it */}
        <img
          src={src}
          alt={title}
          style={{ transform: `rotate(${rotation}deg)${sideways && !zoomed ? " scale(0.72)" : ""}` }}
          className={zoomed ? "max-w-none" : "max-h-full max-w-full object-contain"}
          width={zoomed ? 1800 : undefined}
        />
      </div>
    </div>
  );
}
