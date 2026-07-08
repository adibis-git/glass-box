// Next 16 route proxy (the middleware.ts successor). Gates /app/* behind a
// session using the edge-safe base config (no Prisma in this bundle). Real
// enforcement happens in every route handler via lib/authz.ts.

import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
  matcher: ["/app/:path*"],
};
