"use client";

import { useRef, useState, useTransition } from "react";
import { uploadDocument } from "@/app/apply/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";

export interface UploadCardProps {
  type: string;
  label: string;
  help: string;
  state: "MISSING" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED";
  docId?: string;
  fileName?: string;
  rejectionText?: string;
  validUntil?: string;
  optional?: boolean;
  canReplace: boolean;
  renewalHint?: boolean;
  text: {
    states: Record<string, string>;
    upload: string;
    replace: string;
    view: string;
    uploading: string;
    hint: string;
    validUntil: string;
    locked: string;
    tooBig: string;
    optional: string;
    renewalNote: string;
  };
}

const TONE: Record<string, string> = {
  MISSING: "bg-slate-100 text-slate-600",
  PENDING_REVIEW: "bg-sky-100 text-sky-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-amber-100 text-amber-900",
  EXPIRED: "bg-rose-100 text-rose-800",
};

const MAX_BYTES = MAX_UPLOAD_BYTES;
const MAX_EDGE = 2400;

/** Phone photos are 4–12 MB; downscale to ~2400 px JPEG so uploads are fast on mobile data. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function UploadCard(p: UploadCardProps) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const working = pending || busy;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setError(undefined);
    setBusy(true);
    const file = await shrinkImage(picked);
    setBusy(false);
    if (file.size > MAX_BYTES) return setError(p.text.tooBig);
    const fd = new FormData();
    fd.set("type", p.type);
    fd.set("file", file);
    start(async () => {
      try {
        const res = await uploadDocument(fd);
        if (res?.error) setError(res.error);
      } catch {
        setError("Upload failed. Please try again.");
      }
    });
  }

  const showButton = p.canReplace && (p.state !== "APPROVED" || p.renewalHint);
  const buttonLabel = p.state === "MISSING" ? p.text.upload : p.text.replace;

  return (
    <div className={`rounded-xl border p-4 ${p.state === "REJECTED" ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {p.label}
            {p.optional && <span className="ml-2 text-xs font-medium text-slate-400">{p.text.optional}</span>}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.help}</p>
        </div>
        <span className={`chip shrink-0 ${TONE[p.state]}`}>{p.text.states[p.state]}</span>
      </div>

      {p.rejectionText && p.state === "REJECTED" && (
        <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900" role="alert">{p.rejectionText}</p>
      )}
      {p.renewalHint && p.state === "APPROVED" && <p className="mt-3 text-sm font-medium text-amber-700">{p.text.renewalNote}</p>}
      {p.validUntil && p.state === "APPROVED" && (
        <p className="mt-2 text-xs text-slate-500">{p.text.validUntil} {p.validUntil}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {showButton && (
          <>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              aria-label={p.label}
              onChange={onPick}
            />
            <button
              type="button"
              className={`btn btn-sm ${p.state === "MISSING" || p.state === "REJECTED" || p.state === "EXPIRED" ? "btn-primary" : "btn-secondary"}`}
              disabled={working}
              onClick={() => input.current?.click()}
            >
              {working ? p.text.uploading : buttonLabel}
            </button>
          </>
        )}
        {p.docId && (
          <a href={`/api/files/${p.docId}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-700 hover:underline">
            {p.text.view}
            {p.fileName ? ` · ${p.fileName}` : ""}
          </a>
        )}
        {!showButton && p.state === "APPROVED" && <span className="text-xs text-slate-500">{p.text.locked}</span>}
      </div>
      {!p.docId && showButton && <p className="mt-2 text-xs text-slate-400">{p.text.hint}</p>}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-rose-600">{error}</p>}
    </div>
  );
}
