"use client";

import { useRef, useState, useTransition } from "react";
import { deletePayslip, uploadPayslip } from "@/app/admin/payroll/actions";
import { MAX_PAYSLIP_BYTES, MAX_UPLOAD_LABEL } from "@/lib/limits";

interface Props {
  riderId: string;
  kind: string;
  year: number;
  month: number;
  existingId?: string;
}

export function PayslipUpload({ riderId, kind, year, month, existingId }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(undefined);
    if (file.size > MAX_PAYSLIP_BYTES) return setError(`File is too large (max ${MAX_UPLOAD_LABEL}).`);
    const fd = new FormData();
    Object.entries({ riderId, kind, year, month }).forEach(([k, v]) => fd.set(k, String(v)));
    fd.set("file", file);
    start(async () => {
      const res = await uploadPayslip(fd);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <input ref={input} type="file" accept="application/pdf" className="sr-only" aria-label="Upload PDF" onChange={onPick} />
        <button type="button" className={`btn btn-sm ${existingId ? "btn-secondary" : "btn-primary"}`} disabled={pending} onClick={() => input.current?.click()}>
          {pending ? "Uploading…" : existingId ? "Replace" : "Upload PDF"}
        </button>
        {existingId && (
          <button
            type="button"
            className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Delete this document permanently? Use Replace to correct it instead.")) return;
              const fd = new FormData();
              fd.set("id", existingId);
              start(async () => {
                const res = await deletePayslip(fd);
                if (res.error) setError(res.error);
              });
            }}
          >
            Delete
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
