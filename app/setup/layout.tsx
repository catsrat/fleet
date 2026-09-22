import { Logo } from "@/components/Logo";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <header className="mx-auto w-full max-w-5xl px-5 py-6">
        <Logo dark />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-20">{children}</main>
    </div>
  );
}
