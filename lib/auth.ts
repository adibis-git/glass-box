// Full Auth.js configuration (Node runtime): Credentials + optional Google.
// JWT sessions; no DB session adapter — Membership is re-checked in the DB by
// lib/authz.ts on every API call, so the JWT is only a routing/UX hint.

import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";

async function firstMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { orgId: true, role: true },
  });
}

const providers: NextAuthConfig["providers"] = [];

providers.push(
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email ?? "").trim().toLowerCase();
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;

      const m = await firstMembership(user.id);
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        activeOrgId: m?.orgId ?? null,
        activeRole: m?.role ?? null,
      };
    },
  }),
);

// Google is optional — only active when env vars are configured.
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
});
