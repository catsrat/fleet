"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
  icon: "dash" | "queue" | "riders" | "shield" | "bike" | "log" | "team" | "clock" | "wallet";
}

const ICONS: Record<NavItem["icon"], string> = {
  dash: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  queue: "M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01",
  riders: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4 21a8 8 0 0 1 16 0",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3ZM9 12l2 2 4-4",
  bike: "M5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 18l-3-6h7l3 6M9 12l-2-4h3",
  log: "M6 3h9l4 4v14H6V3ZM14 3v5h5M9 13h7M9 17h7",
  team: "M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2ZM16 14.5h.01",
};

export function AdminNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Main">
      {items.map((item) => {
        const active = item.href === "/admin" ? path === "/admin" : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/8 hover:text-white"
            }`}
          >
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICONS[item.icon]} />
            </svg>
            <span className="flex-1">{item.label}</span>
            {!!item.badge && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-white">{item.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
