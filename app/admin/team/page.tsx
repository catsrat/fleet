import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/admin-ui";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { requireOwner } from "@/lib/session";
import { createStaff, resetStaffMfa, resetStaffPassword, setUserActive } from "./actions";

export const metadata: Metadata = { title: "Team" };

const ROLE_TONE: Record<string, string> = {
  OWNER: "bg-brand-100 text-brand-800",
  ADMIN: "bg-indigo-100 text-indigo-800",
  REVIEWER: "bg-slate-100 text-slate-700",
};

export default async function TeamPage() {
  await requireOwner();
  const staff = await db.user.findMany({ where: { role: { in: ["OWNER", "ADMIN", "REVIEWER"] } }, orderBy: [{ role: "desc" }, { name: "asc" }] });

  return (
    <>
      <PageHeader title="Team" subtitle="Reviewers verify documents. Admins also see payroll, payslips and exports. Only you, the owner, manage this list." />

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-slate-100"><tr><th className="th">Person</th><th className="th">Role</th><th className="th">Two-factor</th><th className="th">Last sign-in</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                <td className="td">
                  <p className="font-semibold text-slate-900">{u.name}</p>
                  <p className="text-xs text-slate-500">{u.username ? `ID ${u.username} · ` : ""}{u.email}</p>
                </td>
                <td className="td"><span className={`chip ${ROLE_TONE[u.role]}`}>{ROLE_LABEL[u.role as Role]}</span></td>
                <td className="td">{u.totpEnabledAt ? <span className="chip bg-emerald-100 text-emerald-800">On</span> : <span className="chip bg-amber-100 text-amber-900">Not set up</span>}</td>
                <td className="td tabular-nums">{fmtDateTime(u.lastLoginAt)}</td>
                <td className="td">
                  {u.role !== "OWNER" && (
                    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
                      <ActionForm action={resetStaffPassword} submit="Reset password" pendingLabel="…" buttonClass="text-xs font-medium text-brand-700 hover:underline" confirm={`Generate a new temporary password for ${u.name}?`}>
                        <input type="hidden" name="userId" value={u.id} />
                      </ActionForm>
                      {u.totpEnabledAt && (
                        <ActionForm action={resetStaffMfa} submit="Reset 2FA" pendingLabel="…" buttonClass="text-xs font-medium text-brand-700 hover:underline" confirm={`Clear ${u.name}'s authenticator? They will set up a new one at next sign-in.`}>
                          <input type="hidden" name="userId" value={u.id} />
                        </ActionForm>
                      )}
                      <form action={setUserActive}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={u.active ? "0" : "1"} />
                        <button className={`text-xs font-medium hover:underline ${u.active ? "text-rose-600" : "text-emerald-700"}`}>{u.active ? "Deactivate" : "Activate"}</button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card mt-6 p-5">
        <h2 className="mb-4 font-semibold">Add a team member</h2>
        <ActionForm action={createStaff} submit="Create account" pendingLabel="Creating…" resetOnSuccess className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" className="input" required /></div>
            <div><label className="label" htmlFor="username">Sign-in ID</label><input id="username" name="username" className="input font-mono" required autoCapitalize="none" placeholder="mia.k" /></div>
            <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required /></div>
            <div><label className="label" htmlFor="role">Role</label><select id="role" name="role" className="input"><option value="REVIEWER">Reviewer</option><option value="ADMIN">Admin</option></select></div>
          </div>
          <p className="help">A temporary password is generated and shown once. At first sign-in they must choose their own password and set up an authenticator app.</p>
        </ActionForm>
      </section>
    </>
  );
}
