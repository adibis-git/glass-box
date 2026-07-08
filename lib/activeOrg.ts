// Server-component helper: resolve the signed-in user's orgs and active org.
// The JWT's activeOrgId is a hint; we validate membership here and fall back to
// the user's first org.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/generated/prisma/enums";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface ActiveOrgContext {
  userId: string;
  userName: string | null;
  userEmail: string;
  orgs: OrgSummary[];
  active: OrgSummary | null;
}

export async function getActiveOrg(): Promise<ActiveOrgContext | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { org: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  const orgs: OrgSummary[] = memberships.map((m) => ({
    id: m.org.id,
    name: m.org.name,
    slug: m.org.slug,
    role: m.role,
  }));

  const hinted = session.user.activeOrgId;
  const active = orgs.find((o) => o.id === hinted) ?? orgs[0] ?? null;

  return {
    userId,
    userName: session.user.name ?? null,
    userEmail: session.user.email ?? "",
    orgs,
    active,
  };
}
