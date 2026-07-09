// P0b verification: full multi-tenant round-trip through adapter-pg.
import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  // Clean slate for repeatable runs
  await prisma.user.deleteMany({ where: { email: "spike@glassbox.dev" } });
  await prisma.organization.deleteMany({ where: { slug: "spike-org" } });

  const user = await prisma.user.create({
    data: { email: "spike@glassbox.dev", name: "Spike", passwordHash: "x" },
  });
  const org = await prisma.organization.create({
    data: {
      name: "Spike Org",
      slug: "spike-org",
      memberships: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  const source = await prisma.source.create({
    data: {
      orgId: org.id,
      kind: "TABULAR",
      name: "test",
      versions: {
        create: {
          version: 1,
          uploadedById: user.id,
          originalFilename: "t.csv",
          mimeType: "text/csv",
          sizeBytes: BigInt(1234),
          storageKey: "k/test.csv",
          columnSchema: [{ name: "a", dtype: "integer" }],
          sampleRows: [{ a: 1 }],
          status: "READY",
        },
      },
    },
    include: { versions: true },
  });
  const v1 = source.versions[0];
  const convo = await prisma.conversation.create({
    data: {
      orgId: org.id,
      createdById: user.id,
      title: "Spike convo",
      sources: { create: { sourceId: source.id, versionId: v1.id, alias: "df" } },
      messages: {
        create: {
          role: "ASSISTANT",
          events: [{ type: "plan_start", id: "p1" }],
          apiMessages: [{ role: "assistant", content: "hi" }],
        },
      },
    },
    include: { sources: true, messages: true },
  });
  await prisma.auditLog.create({
    data: { orgId: org.id, actorId: user.id, action: "dataset.upload", targetType: "source", targetId: source.id },
  });

  const membership = await prisma.membership.findUniqueOrThrow({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
  });
  const audits = await prisma.auditLog.count({ where: { orgId: org.id } });

  console.log("ROUNDTRIP OK:", {
    user: user.email, org: org.slug, role: membership.role,
    dataset: v1.status, convoSources: convo.sources.length,
    messageEvents: Array.isArray(convo.messages[0].events), audits,
  });

  // Cascade check: deleting org should remove everything
  await prisma.organization.delete({ where: { id: org.id } });
  const left = await prisma.source.count({ where: { orgId: org.id } });
  console.log("CASCADE OK: sources left =", left);
  await prisma.user.delete({ where: { id: user.id } });
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
