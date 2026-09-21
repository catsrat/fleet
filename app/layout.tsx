import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/lib/locale";

export const metadata: Metadata = {
  title: { default: "Nucleus Fleet — Rider onboarding", template: "%s · Nucleus Fleet" },
  description: "Apply to deliver with Uber Eats on an e-bike in Germany. Upload your documents, get verified, start riding.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
