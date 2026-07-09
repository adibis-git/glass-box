import { notFound, redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { prisma } from "@/lib/db";
import { fmtInt } from "@/lib/utils";
import { PageHeader } from "@/components/app/PageHeader";
import { DatasetDetail } from "@/components/app/DatasetDetail";

export default async function DatasetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const org = ctx.active;

  const source = await prisma.source.findFirst({
    where: { id, orgId: org.id },
    include: {
      versions: { where: { deletedAt: null }, orderBy: { version: "desc" } },
    },
  });
  const d = source?.versions[0]; // latest live version
  if (!source || !d) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title={source.name}
        subtitle={`v${d.version} · ${d.originalFilename}${d.sheetName ? ` · sheet: ${d.sheetName}` : ""} · ${(Number(d.sizeBytes) / 1048576).toFixed(1)} MB${d.rowCount ? ` · ${fmtInt(d.rowCount)} rows` : ""}${d.sampled ? " · representative sample" : ""}`}
      />
      <DatasetDetail
        orgId={org.id}
        myRole={org.role}
        dataset={{
          id: source.id,
          name: source.name,
          status: d.status,
          availableSheets: (d.availableSheets as string[] | null) ?? null,
          columnSchema: (d.columnSchema as { name: string; dtype: string }[] | null) ?? null,
          sampleRows: (d.sampleRows as Record<string, unknown>[] | null) ?? null,
          normalizations:
            (d.normalizations as { kind: string; detail: string }[] | null) ?? null,
          sampled: d.sampled,
          errorMessage: d.errorMessage,
        }}
        versions={source.versions.map((v) => ({
          version: v.version,
          originalFilename: v.originalFilename,
          rowCount: v.rowCount,
          status: v.status,
          sampled: v.sampled,
          createdAt: v.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
