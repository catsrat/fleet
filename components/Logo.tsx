import Link from "next/link";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-brand-600" />
      <circle cx="16" cy="16" r="3.6" fill="white" />
      <ellipse cx="16" cy="16" rx="10" ry="4.2" stroke="white" strokeWidth="1.6" transform="rotate(-30 16 16)" />
      <ellipse cx="16" cy="16" rx="10" ry="4.2" stroke="white" strokeOpacity=".55" strokeWidth="1.6" transform="rotate(30 16 16)" />
    </svg>
  );
}

export function Logo({ href = "/", dark = false }: { href?: string; dark?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className={`text-base font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>
        Nucleus <span className={dark ? "text-brand-300" : "text-brand-600"}>Fleet</span>
      </span>
    </Link>
  );
}
