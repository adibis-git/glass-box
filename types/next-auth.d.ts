import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** UX hint only — routes re-check Membership in the DB. */
      activeOrgId: string | null;
      activeRole: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    activeOrgId?: string | null;
    activeRole?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    activeOrgId?: string | null;
    activeRole?: string | null;
  }
}
