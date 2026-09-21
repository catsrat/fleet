"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function RiderTabs({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-5" aria-label="Rider">
      {items.map((item) => {
        const active = item.href === "/apply" ? path === "/apply" : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
