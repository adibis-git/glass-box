import { redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/app/PageHeader";
import { MembersManager } from "@/components/app/MembersManager";

export default async function MembersPage() {
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const org = ctx.active;

  const members = await prisma.membership.findMany({
    where: { orgId: org.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  const isAdmin = org.role === "ADMIN" || org.role === "OWNER";
  const invitations = isAdmin
    ? await prisma.invitation.findMany({
        where: { orgId: org.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, token: true, expiresAt: true },
      })
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Members"
        subtitle="Who can see and analyze data in this workspace, and what they're allowed to do."
      />
      <MembersManager
        orgId={org.id}
        myUserId={ctx.userId}
        myRole={org.role}
        members={members.map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
        }))}
        invitations={invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          acceptPath: `/invite/${i.token}`,
          expiresAt: i.expiresAt.toISOString(),
        }))}
      />
    </div>
  );
}
