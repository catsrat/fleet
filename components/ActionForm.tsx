"use client";

import { useState, useTransition } from "react";

export type FormState = { ok?: boolean; error?: string; message?: string };
type Action = (fd: FormData) => Promise<FormState | void>;

interface Props {
  action: Action;
  children: React.ReactNode;
  submit?: string;
  pendingLabel?: string;
  className?: string;
  buttonClass?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  disabled?: boolean;
}

/**
 * Runs a server action from a normal form without React 19's automatic field reset,
 * so a validation error never wipes what the user typed.
 */
export function ActionForm({
  action,
  children,
  submit = "Save",
  pendingLabel = "Saving…",
  className,
  buttonClass = "btn btn-primary",
  resetOnSuccess = false,
  confirm: confirmText,
  disabled,
}: Props) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmText && !window.confirm(confirmText)) return;
        const form = e.currentTarget;
        const fd = new FormData(form);
        setState({});
        start(async () => {
          try {
            const res = await action(fd);
            setState(res ?? { ok: true });
            if (res?.ok && resetOnSuccess) form.reset();
          } catch (err) {
            const digest = (err as { digest?: string })?.digest;
            if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return;
            setState({ error: "Something went wrong. Please try again." });
          }
        });
      }}
    >
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClass} disabled={pending || disabled}>
          {pending ? pendingLabel : submit}
        </button>
        <div aria-live="polite" className="text-sm">
          {state.error && <p role="alert" className="font-medium text-rose-600">{state.error}</p>}
          {!state.error && state.message && <p className="font-medium text-brand-700">{state.message}</p>}
        </div>
      </div>
    </form>
  );
}
