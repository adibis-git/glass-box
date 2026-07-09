import { redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/app/PageHeader";

export default async function AuditPage() {
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const org = ctx.active;
  const isAdmin = org.role === "ADMIN" || org.role === "OWNER";

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <PageHeader title="Audit log" />
        <div className="rounded-2xl border border-border bg-panel p-8 text-center text-sm text-muted">
          The audit log is visible to admins and owners only.
        </div>
      </div>
    );
  }

  const [logs, actors] = await Promise.all([
    prisma.auditLog.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.membership.findMany({
      where: { orgId: org.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  const nameOf = new Map(actors.map((m) => [m.user.id, m.user.name ?? m.user.email]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Audit log"
        subtitle="Every security-relevant action in this workspace — uploads, analyses, role changes, deletions, guardrail blocks."
      />
      <div className="overflow-x-auto rounded-2xl border border-border bg-panel">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">No activity yet.</div>
        ) : (
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id.toString()} className="border-b border-border/60 align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">
                    {fmtDateTime(l.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground/80">
                    {l.actorId ? nameOf.get(l.actorId) ?? l.actorId.slice(0, 8) : "system"}
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                      {l.action}
                    </code>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {l.targetType ? `${l.targetType}:${(l.targetId ?? "").slice(0, 10)}` : "—"}
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-2.5 font-mono text-[11px] text-muted">
                    {l.metadata ? JSON.stringify(l.metadata) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
