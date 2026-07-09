import { notFound, redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { prisma } from "@/lib/db";
import { ConversationWorkspace } from "@/components/app/ConversationWorkspace";
import { PERSONA_FRAMING } from "@/lib/agent/personas";
import type { AgentEvent } from "@/lib/agent/events";
import type { AnalysisEffort, Persona } from "@/lib/generated/prisma/enums";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const org = ctx.active;

  const [c, orgRow, membership] = await Promise.all([
    prisma.conversation.findFirst({
      where: { id, orgId: org.id },
      include: {
        datasets: { include: { dataset: { select: { id: true, name: true, sampled: true, rowCount: true } } } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.organization.findUnique({ where: { id: org.id }, select: { domain: true } }),
    prisma.membership.findUnique({
      where: { userId_orgId: { userId: ctx.userId, orgId: org.id } },
      select: { persona: true },
    }),
  ]);
  if (!c) notFound();

  const persona = (membership?.persona as Persona | null) ?? null;

  return (
    <ConversationWorkspace
      orgId={org.id}
      myRole={org.role}
      personaLabel={persona ? PERSONA_FRAMING[persona].label : null}
      domain={orgRow?.domain ?? null}
      conversation={{
        id: c.id,
        title: c.title,
        defaultEffort: c.defaultEffort as AnalysisEffort,
        starterQuestions: asStringArray(c.starterQuestions),
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
          suggestions: asStringArray(m.suggestions),
        })),
      }}
    />
  );
}
