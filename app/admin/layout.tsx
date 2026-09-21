import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { AdminNav, type NavItem } from "@/components/AdminNav";
import { Logo } from "@/components/Logo";
import { db } from "@/lib/db";
import { isAdminRole, isOwnerRole, ROLE_LABEL, type Role } from "@/lib/roles";
import { requireStaff } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const pending = await db.document.count({ where: { status: "PENDING_REVIEW" } });

  const items: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: "dash" },
    { href: "/admin/review", label: "Review queue", icon: "queue", badge: pending },
    { href: "/admin/riders", label: "Riders", icon: "riders" },
    { href: "/admin/schedule", label: "Schedule", icon: "clock" },
    { href: "/admin/compliance", label: "Compliance", icon: "shield" },
    { href: "/admin/bikes", label: "Fleet", icon: "bike" },
    ...(isAdminRole(user.role)
      ? [
          { href: "/admin/payroll", label: "Payroll", icon: "wallet" } as NavItem,
          { href: "/admin/audit", label: "Audit log", icon: "log" } as NavItem,
        ]
      : []),
    ...(isOwnerRole(user.role) ? [{ href: "/admin/team", label: "Team", icon: "team" } as NavItem] : []),
  ];

  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-ink px-4 py-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:py-6">
        <div className="mb-4 flex items-center justify-between lg:mb-8 lg:px-2">
          <Logo href="/admin" dark />
          <div className="flex items-center gap-3 text-sm lg:hidden">
            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">{ROLE_LABEL[user.role as Role]}</span>
            <Link href="/account" className="text-slate-300 hover:text-white">Account</Link>
            <form action={logout}>
              <button className="text-slate-300 hover:text-white">Log out</button>
            </form>
          </div>
        </div>
        <AdminNav items={items} />
        <div className="mt-4 hidden border-t border-white/10 pt-4 lg:mt-auto lg:block">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-400">{ROLE_LABEL[user.role as Role]}</p>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/account" className="text-slate-300 hover:text-white">Account</Link>
            <form action={logout}>
              <button className="text-slate-300 hover:text-white">Log out</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
