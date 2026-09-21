import { PrismaClient } from "@prisma/client";

// One client per server instance. In development the module is re-evaluated on every hot reload, so the
// instance is cached on globalThis to avoid exhausting database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
