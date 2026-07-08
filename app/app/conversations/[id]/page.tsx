import { notFound, redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { prisma } from "@/lib/db";
import { ConversationWorkspace } from "@/components/app/ConversationWorkspace";
import type { AgentEvent } from "@/lib/agent/events";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const org = ctx.active;

  const c = await prisma.conversation.findFirst({
    where: { id, orgId: org.id },
    include: {
      datasets: { include: { dataset: { select: { id: true, name: true, sampled: true, rowCount: true } } } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!c) notFound();

  return (
    <ConversationWorkspace
      orgId={org.id}
      myRole={org.role}
      conversation={{
        id: c.id,
        title: c.title,
        datasets: c.datasets.map((l) => ({
          alias: l.alias,
          name: l.dataset.name,
          sampled: l.dataset.sampled,
          rowCount: l.dataset.rowCount,
        })),
        messages: c.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          events: (m.events as AgentEvent[] | null) ?? null,
          status: m.status,
          error: m.error,
        })),
      }}
    />
  );
}
