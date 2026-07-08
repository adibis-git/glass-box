// Prisma CLI configuration.
//
// Two URLs, mirroring Neon's pooled/direct split:
//   DATABASE_URL          — runtime (app via @prisma/adapter-pg). Local: plain TCP
//                           port of `prisma dev`. Prod: Neon POOLED (-pooler) URL.
//   MIGRATE_DATABASE_URL  — CLI/migrations. Local: the prisma+postgres:// URL from
//                           `prisma dev ls` (carries the shadow-DB config).
//                           Prod: Neon DIRECT (non-pooler) URL.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["MIGRATE_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
