// RBAC enforcement — the single helper every org-scoped route handler calls
// first. Always re-checks Membership in the DB (the JWT's activeOrgId/activeRole
// are UX hints only; roles can change mid-session).

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/generated/prisma/enums";

const RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export class AuthzError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Ctx {
  userId: string;
  email: string;
  orgId: string;
  role: Role;
}

/** Throws AuthzError(401) when unauthenticated, (403) when role is insufficient. */
export async function authorize(orgId: string, required: Role): Promise<Ctx> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new AuthzError(401, "Not signed in.");

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true },
  });
  if (!membership || RANK[membership.role] < RANK[required]) {
    throw new AuthzError(403, "You don't have permission to do that in this organization.");
  }
  return {
    userId,
    email: session.user.email ?? "",
    orgId,
    role: membership.role,
  };
}

/** Session-only check (no org) — for routes like org creation / invitation accept. */
export async function requireSession(): Promise<{ userId: string; email: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new AuthzError(401, "Not signed in.");
  return { userId, email: session.user.email ?? "" };
}

/** Uniform error → Response mapping for route handlers. */
export function authzErrorResponse(err: unknown): Response | null {
  if (err instanceof AuthzError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}
