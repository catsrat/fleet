import { Logo } from "@/components/Logo";
import { LocaleSwitch } from "@/components/LocaleSwitch";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        <LocaleSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-16">{children}</main>
    </div>
  );
}
