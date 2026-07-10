import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { NewConversation } from "@/components/app/NewConversation";

export default async function ConversationsPage() {
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const org = ctx.active;

  const [conversations, readySources] = await Promise.all([
    prisma.conversation.findMany({
      where: { orgId: org.id },
      orderBy: { updatedAt: "desc" },
      include: {
        sources: { include: { source: { select: { name: true } } } },
        _count: { select: { messages: true } },
      },
      take: 50,
    }),
    prisma.source.findMany({
      where: { orgId: org.id, versions: { some: { deletedAt: null, status: "READY" } } },
      orderBy: { createdAt: "desc" },
      include: {
        versions: {
          where: { deletedAt: null, status: "READY" },
          orderBy: { version: "desc" },
          take: 1,
          select: { rowCount: true },
        },
      },
    }),
  ]);
  // NewConversation expects { id, name, rowCount } — surface the latest version.
  const readyDatasets = readySources.map((s) => ({
    id: s.id,
    name: s.name,
    rowCount: s.versions[0]?.rowCount ?? null,
  }));

  const canCreate = org.role !== "VIEWER";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Conversations"
        subtitle="Each conversation analyzes one or more datasets — pick several to let the agent join them."
        action={canCreate ? <NewConversation orgId={org.id} datasets={readyDatasets} /> : undefined}
      />
      {conversations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-panel/50 p-12 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border border-accent/40 bg-accent/15 text-accent">
            <MessagesSquare size={22} />
          </div>
          <h2 className="text-sm font-semibold text-foreground">No conversations yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Open a source and click <span className="text-foreground/80">Analyze</span> to start
            your first conversation — ask across spreadsheets and documents alike.
          </p>
          <Link
            href="/app/datasets"
            className="mt-4 inline-block text-sm text-accent hover:underline"
          >
            Go to datasets →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-panel">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/app/conversations/${c.id}`}
              className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-0 hover:bg-panel-2/50"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{c.title}</div>
                <div className="truncate text-xs text-muted">
                  {c.sources.map((d) => d.source.name).join(" + ") || "no datasets"} ·{" "}
                  {c._count.messages} messages
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted">
                {fmtDate(c.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
