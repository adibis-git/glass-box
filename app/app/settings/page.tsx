import { redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/app/PageHeader";
import { OrgSettings } from "@/components/app/OrgSettings";

export default async function SettingsPage() {
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const org = ctx.active;

  const [full, membership] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: { id: true, name: true, slug: true, retentionDays: true, domain: true, vertical: true },
    }),
    prisma.membership.findUnique({
      where: { userId_orgId: { userId: ctx.userId, orgId: org.id } },
      select: { persona: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader title="Settings" subtitle="Workspace configuration, data retention, and danger zone." />
      <OrgSettings
        org={{
          id: full.id,
          name: full.name,
          slug: full.slug,
          retentionDays: full.retentionDays,
          domain: full.domain,
          vertical: full.vertical,
        }}
        myRole={org.role}
        myPersona={membership?.persona ?? null}
      />
    </div>
  );
}
