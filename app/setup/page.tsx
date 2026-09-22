import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { MIN_RIDER_AGE } from "@/lib/constants";
import { ownerExists, setupEnabled } from "@/lib/setup";
import { createOwner } from "./actions";

export const metadata: Metadata = { title: "First-time setup", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const disabled = !setupEnabled();
  const taken = await ownerExists();

  if (disabled || taken) {
    return (
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">Setup closed</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {taken
            ? "An administrator account already exists for this site, so this page is no longer available."
            : "This deployment has no setup code configured, so the first-time setup page is switched off."}
        </p>
        <Link href="/staff/login" className="btn btn-primary mt-6 w-full">Go to staff sign-in</Link>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Create the administrator account</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        This runs once, to create the owner account for {""}
        <span className="font-medium text-slate-900">Nucleus Fleet</span>. After that this page closes permanently.
        You will set up an authenticator app at your first sign-in.
      </p>

      <ActionForm action={createOwner} submit="Create account" pendingLabel="Creating…" className="mt-6 space-y-4" buttonClass="btn btn-primary w-full">
        <div>
          <label className="label" htmlFor="token">Setup code</label>
          <input id="token" name="token" required autoComplete="off" spellCheck={false} className="input font-mono" />
          <p className="help">From your deployment&apos;s environment variables (<code>SETUP_TOKEN</code>).</p>
        </div>
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" name="name" required maxLength={80} autoComplete="name" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="username">Sign-in ID</label>
          <input id="username" name="username" required autoCapitalize="none" spellCheck={false} autoComplete="username" placeholder="praful" className="input font-mono" />
          <p className="help">3–32 lowercase letters, digits, dots, dashes or underscores. You type this to sign in.</p>
        </div>
        <div>
          <label className="label" htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className="input" />
          <p className="help">At least 12 characters, with letters and numbers.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">Repeat password</label>
          <input id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" className="input" />
        </div>
      </ActionForm>

      <p className="mt-6 text-xs leading-relaxed text-slate-500">
        Riders sign up separately at <Link href="/register" className="font-medium text-brand-700 hover:underline">/register</Link> and must be at least {MIN_RIDER_AGE}.
      </p>
    </div>
  );
}
