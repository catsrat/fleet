"use client";

import { useState, useTransition } from "react";
import { addSlots } from "@/app/apply/availability/actions";

interface Props {
  text: {
    daysLabel: string;
    days: string[];
    from: string;
    to: string;
    quick: string;
    presets: { evening: string; lunch: string; weekend: string };
    add: string;
    saved: string;
  };
}

const TIMES = Array.from({ length: 37 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export function AvailabilityForm({ text }: Props) {
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("22:00");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  const presets: { key: keyof Props["text"]["presets"]; from: string; to: string; days?: number[] }[] = [
    { key: "evening", from: "17:00", to: "22:00" },
    { key: "lunch", from: "11:00", to: "14:00" },
    { key: "weekend", from: "10:00", to: "20:00", days: [6, 7] },
  ];

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(undefined);
        const fd = new FormData();
        days.forEach((d) => fd.append("day", String(d)));
        fd.set("start", start);
        fd.set("end", end);
        startTransition(async () => {
          const res = await addSlots(fd);
          setMessage(res.error ? { ok: false, text: res.error } : { ok: true, text: res.message ?? text.saved });
        });
      }}
    >
      <fieldset>
        <legend className="label">{text.daysLabel}</legend>
        <div className="flex flex-wrap gap-2">
          {text.days.map((label, i) => {
            const day = i + 1;
            const on = days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => setDays(on ? days.filter((d) => d !== day) : [...days, day])}
                className={`min-w-12 rounded-lg border px-3 py-2 text-sm font-semibold transition ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="slot-start">{text.from}</label>
          <select id="slot-start" value={start} onChange={(e) => setStart(e.target.value)} className="input">
            {TIMES.slice(0, -2).map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="slot-end">{text.to}</label>
          <select id="slot-end" value={end} onChange={(e) => setEnd(e.target.value)} className="input">
            {TIMES.slice(2).map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">{text.quick}:</span>
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            className="chip bg-slate-100 text-slate-700 hover:bg-slate-200"
            onClick={() => {
              setStart(p.from);
              setEnd(p.to);
              if (p.days) setDays(p.days);
            }}
          >
            {text.presets[p.key]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || days.length === 0}>{pending ? "…" : text.add}</button>
        {message && <p role={message.ok ? "status" : "alert"} className={`text-sm font-medium ${message.ok ? "text-brand-700" : "text-rose-600"}`}>{message.text}</p>}
      </div>
    </form>
  );
}
