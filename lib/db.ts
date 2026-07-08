// Prisma client singleton (Prisma 7, engineless — connects via @prisma/adapter-pg).
//
// DATABASE_URL is the RUNTIME url: local `prisma dev` plain-TCP port in dev,
// Neon POOLED (-pooler) URL in production. Migrations use MIGRATE_DATABASE_URL
// (see prisma.config.ts).
//
// globalThis caching keeps a single client (and pg pool) across Next.js dev HMR
// reloads — same pattern the ExecPool will use.

import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
