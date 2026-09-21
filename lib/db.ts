import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * The Prisma CLI resolves a relative `file:` URL against the prisma/ folder, but the generated client
 * resolves it against its own location in node_modules. Pin both to prisma/ so they share one database.
 */
function datasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) return url;
  const file = url.slice("file:".length);
  if (path.isAbsolute(file)) return url;
  return `file:${path.resolve(process.cwd(), "prisma", file).replace(/\\/g, "/")}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: datasourceUrl() });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
