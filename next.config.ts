import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // A stray lockfile in the user's home directory confuses Turbopack's root detection.
  turbopack: { root: path.resolve(/*turbopackIgnore: true*/ process.cwd()) },
  // Documents are uploaded through server actions. Vercel itself rejects bodies above 4.5 MB, so the app-level
  // limit per file is 4 MB (lib/limits.ts) and this leaves room for the form fields around it.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
