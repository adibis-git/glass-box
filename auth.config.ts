// Edge-safe Auth.js base config — NO Prisma/bcrypt imports here.
// proxy.ts builds a lightweight auth() from this to gate /app routes;
// lib/auth.ts extends it with the Credentials provider (Node-only deps).

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Persist our custom claims into the JWT.
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
        // set at login by lib/auth.ts (first membership)
        token.activeOrgId = (user as { activeOrgId?: string }).activeOrgId ?? null;
        token.activeRole = (user as { activeRole?: string }).activeRole ?? null;
      }
      // Org switcher: client calls session.update({ activeOrgId, activeRole })
      // — values are UX hints only; every API route re-checks Membership in DB.
      if (trigger === "update" && session) {
        if (typeof session.activeOrgId === "string") token.activeOrgId = session.activeOrgId;
        if (typeof session.activeRole === "string") token.activeRole = session.activeRole;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string) ?? "";
        session.user.activeOrgId = (token.activeOrgId as string | null) ?? null;
        session.user.activeRole = (token.activeRole as string | null) ?? null;
      }
      return session;
    },
    authorized({ auth: session, request }) {
      // Used by the proxy: gate /app; everything else is public.
      const isApp = request.nextUrl.pathname.startsWith("/app");
      if (!isApp) return true;
      return !!session?.user;
    },
  },
  providers: [], // filled in lib/auth.ts
} satisfies NextAuthConfig;
