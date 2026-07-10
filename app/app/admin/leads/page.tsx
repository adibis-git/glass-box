import { redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/app/PageHeader";
import { LeadsTable, type LeadRow } from "@/components/app/LeadsTable";

// Admin-only inbox for leads captured on the public marketing site. Leads are not
// org-scoped (they arrive anonymously), so this simply requires the viewer to be an
// OWNER/ADMIN of their active workspace.
export default async function AdminLeadsPage() {
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const isAdmin = ctx.active.role === "OWNER" || ctx.active.role === "ADMIN";
  if (!isAdmin) redirect("/app");

  const leads = await prisma.lead.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const rows: LeadRow[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email,
    company: l.company,
    role: l.role,
    message: l.message,
    source: l.source,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
  }));

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Leads"
        subtitle="Demo and contact requests captured from the marketing site. Stored in your database — nothing is sent anywhere else."
      />
      <div className="mb-5 flex flex-wrap gap-2 text-xs">
        {(["NEW", "CONTACTED", "QUALIFIED", "CLOSED"] as const).map((s) => (
          <span key={s} className="rounded-full border border-border bg-panel px-3 py-1 text-muted">
            {s} · <span className="font-semibold text-foreground">{counts[s] ?? 0}</span>
          </span>
        ))}
      </div>
      <LeadsTable initial={rows} />
    </div>
  );
}
