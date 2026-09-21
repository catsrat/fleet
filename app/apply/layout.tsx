import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { Logo } from "@/components/Logo";
import { RiderTabs } from "@/components/RiderTabs";
import { CAN_SET_AVAILABILITY } from "@/lib/constants";
import { db } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { requireRider } from "@/lib/session";

export default async function ApplyLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRider();
  const d = t(await getLocale());
  const payslips = await db.payslip.count({ where: { riderId: user.rider.id, supersededAt: null } });

  const tabs = [
    { href: "/apply", label: d.nav.application },
    ...(payslips > 0 || user.rider.activatedAt ? [{ href: "/apply/payslips", label: d.nav.payslips }] : []),
    ...(CAN_SET_AVAILABILITY.includes(user.rider.status) ? [{ href: "/apply/availability", label: d.nav.availability }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Logo href="/apply" />
          <div className="flex items-center gap-3">
            <LocaleSwitch />
            <Link href="/account" className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 sm:inline">{d.nav.account}</Link>
            <form action={logout}>
              <button className="text-sm font-medium text-slate-600 hover:text-slate-900">{d.nav.logout}</button>
            </form>
          </div>
        </div>
        {tabs.length > 1 && <RiderTabs items={tabs} />}
      </header>
      {children}
    </div>
  );
}
