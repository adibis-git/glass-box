import { notFound, redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { prisma } from "@/lib/db";
import { ConversationWorkspace } from "@/components/app/ConversationWorkspace";
import { PERSONA_FRAMING } from "@/lib/agent/personas";
import { isDocProfile, type DocProfile } from "@/lib/agent/context";
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
        sources: {
          include: {
            source: { select: { id: true, name: true, kind: true } },
            version: { select: { id: true, version: true, sampled: true, rowCount: true, profile: true } },
          },
        },
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

  // Document profile summaries for the context strip (v3 §14.4 / UI §9).
  const documents = c.sources
    .filter((l) => l.source.kind === "DOCUMENT" && isDocProfile(l.version.profile))
    .map((l) => {
      const p = l.version.profile as unknown as DocProfile;
      return {
        sourceId: l.source.id,
        version: l.version.version,
        name: l.source.name,
        docType: p.docType,
        description: p.description,
        pageCount: p.pageCount,
        wordCount: p.wordCount,
        sectionCount: p.sections.length,
      };
    });

  // Adopt-newer-version (v3 §15.1): per pinned source, is there a newer live
  // (READY) SourceVersion than the one this conversation pins?
  const sourceIds = c.sources.map((l) => l.source.id);
  const latestReady = sourceIds.length
    ? await prisma.sourceVersion.findMany({
        where: { sourceId: { in: sourceIds }, status: "READY", deletedAt: null },
        orderBy: { version: "desc" },
        distinct: ["sourceId"],
        select: { sourceId: true, version: true },
      })
    : [];
  const latestBySource = new Map(latestReady.map((v) => [v.sourceId, v.version]));
  const sourceUpdates = c.sources
    .map((l) => {
      const latest = latestBySource.get(l.source.id);
      if (typeof latest !== "number" || latest <= l.version.version) return null;
      return {
        sourceId: l.source.id,
        name: l.source.name,
        pinnedVersion: l.version.version,
        latestVersion: latest,
      };
    })
    .filter((u): u is NonNullable<typeof u> => u !== null);

  return (
    <ConversationWorkspace
      orgId={org.id}
      myRole={org.role}
      personaLabel={persona ? PERSONA_FRAMING[persona].label : null}
      domain={orgRow?.domain ?? null}
      documents={documents}
      sourceUpdates={sourceUpdates}
      conversation={{
        id: c.id,
        title: c.title,
        defaultEffort: c.defaultEffort as AnalysisEffort,
        starterQuestions: asStringArray(c.starterQuestions),
        datasets: c.sources.map((l) => ({
          alias: l.alias,
          name: l.source.name,
          sampled: l.version.sampled,
          rowCount: l.version.rowCount,
          version: l.version.version,
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
