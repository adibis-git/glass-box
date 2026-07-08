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
  const ds = await prisma.dataset.create({
    data: {
      orgId: org.id,
      uploadedById: user.id,
      name: "test",
      originalFilename: "t.csv",
      mimeType: "text/csv",
      sizeBytes: BigInt(1234),
      storageKey: "k/test.csv",
      columnSchema: [{ name: "a", dtype: "integer" }],
      sampleRows: [{ a: 1 }],
      status: "READY",
    },
  });
  const convo = await prisma.conversation.create({
    data: {
      orgId: org.id,
      createdById: user.id,
      title: "Spike convo",
      datasets: { create: { datasetId: ds.id, alias: "df" } },
      messages: {
        create: {
          role: "ASSISTANT",
          events: [{ type: "plan_start", id: "p1" }],
          apiMessages: [{ role: "assistant", content: "hi" }],
        },
      },
    },
    include: { datasets: true, messages: true },
  });
  await prisma.auditLog.create({
    data: { orgId: org.id, actorId: user.id, action: "dataset.upload", targetType: "dataset", targetId: ds.id },
  });

  const membership = await prisma.membership.findUniqueOrThrow({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
  });
  const audits = await prisma.auditLog.count({ where: { orgId: org.id } });

  console.log("ROUNDTRIP OK:", {
    user: user.email, org: org.slug, role: membership.role,
    dataset: ds.status, convoDatasets: convo.datasets.length,
    messageEvents: Array.isArray(convo.messages[0].events), audits,
  });

  // Cascade check: deleting org should remove everything
  await prisma.organization.delete({ where: { id: org.id } });
  const left = await prisma.dataset.count({ where: { orgId: org.id } });
  console.log("CASCADE OK: datasets left =", left);
  await prisma.user.delete({ where: { id: user.id } });
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
