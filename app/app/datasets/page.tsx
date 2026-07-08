import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { prisma } from "@/lib/db";
import { fmtInt, fmtDate } from "@/lib/utils";
import { PageHeader } from "@/components/app/PageHeader";
import { UploadButton } from "@/components/app/UploadButton";

function fmtBytes(n: bigint | number): string {
  const b = Number(n);
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

const STATUS_STYLE: Record<string, string> = {
  READY: "bg-green/15 text-green border-green/30",
  PROCESSING: "bg-amber/15 text-amber border-amber/30",
  NEEDS_SHEET_PICK: "bg-blue/15 text-blue border-blue/30",
  ERROR: "bg-red/15 text-red border-red/30",
};

export default async function DatasetsPage() {
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const org = ctx.active;
  const canUpload = org.role !== "VIEWER";

  const datasets = await prisma.dataset.findMany({
    where: { orgId: org.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, originalFilename: true, sizeBytes: true,
      rowCount: true, status: true, sampled: true, createdAt: true, sheetName: true,
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="Datasets"
        subtitle="Upload CSV or Excel files, then start a conversation to analyze them."
        action={canUpload ? <UploadButton orgId={org.id} /> : undefined}
      />

      {datasets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-panel/50 p-12 text-center">
          <div className="mb-3 text-4xl">🗂️</div>
          <h2 className="text-sm font-semibold text-foreground">No datasets yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {canUpload
              ? "Upload a CSV or Excel file to get started. Messy files welcome — we'll clean them and show you what changed."
              : "A member or admin needs to upload data before you can view analyses."}
          </p>
          {canUpload && (
            <div className="mt-5 flex justify-center">
              <UploadButton orgId={org.id} />
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Rows</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id} className="border-b border-border/60 last:border-0 hover:bg-panel-2/50">
                  <td className="px-4 py-3">
                    <Link href={`/app/datasets/${d.id}`} className="font-medium text-foreground hover:text-accent">
                      {d.name}
                    </Link>
                    <div className="text-xs text-muted">
                      {d.originalFilename}
                      {d.sheetName ? ` · ${d.sheetName}` : ""}
                      {d.sampled ? " · sampled" : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground/80">{d.rowCount != null ? fmtInt(d.rowCount) : "—"}</td>
                  <td className="px-4 py-3 text-foreground/80">{fmtBytes(d.sizeBytes)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[d.status] ?? ""}`}>
                      {d.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{fmtDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
