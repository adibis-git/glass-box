"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

interface DatasetProp {
  id: string;
  name: string;
  status: string;
  availableSheets: string[] | null;
  columnSchema: { name: string; dtype: string }[] | null;
  sampleRows: Record<string, unknown>[] | null;
  normalizations: { kind: string; detail: string }[] | null;
  sampled: boolean;
  errorMessage: string | null;
}

export function DatasetDetail({
  orgId,
  myRole,
  dataset,
}: {
  orgId: string;
  myRole: Role;
  dataset: DatasetProp;
}) {
  const router = useRouter();
  const canAnalyze = myRole !== "VIEWER";
  const canDelete = myRole === "ADMIN" || myRole === "OWNER";
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pickSheet(sheetName: string) {
    setBusy(sheetName);
    setErr(null);
    const res = await fetch(`/api/orgs/${orgId}/datasets/${dataset.id}/sheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetName }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setErr(j.error ?? "Failed to process the sheet.");
    router.refresh();
  }

  async function analyze() {
    setBusy("analyze");
    setErr(null);
    const res = await fetch(`/api/orgs/${orgId}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Analysis of ${dataset.name}`,
        datasets: [{ datasetId: dataset.id, alias: "df" }],
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setErr(j.error ?? "Could not start the conversation.");
    router.push(`/app/conversations/${j.conversation.id}`);
  }

  async function destroy(hard: boolean) {
    if (!confirm(hard ? "Permanently delete this dataset AND its stored files?" : "Move this dataset to trash?")) return;
    setBusy("delete");
    const res = await fetch(`/api/orgs/${orgId}/datasets/${dataset.id}?hard=${hard}`, {
      method: "DELETE",
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return setErr(j.error ?? "Delete failed.");
    }
    router.push("/app/datasets");
    router.refresh();
  }

  if (dataset.status === "NEEDS_SHEET_PICK") {
    return (
      <div className="rounded-2xl border border-blue/30 bg-blue/5 p-6">
        <h2 className="text-sm font-semibold text-foreground">This workbook has multiple sheets</h2>
        <p className="mt-1 text-sm text-muted">Pick the sheet you want to analyze:</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(dataset.availableSheets ?? []).map((s) => (
            <Button key={s} variant="secondary" size="sm" disabled={!!busy} onClick={() => pickSheet(s)}>
              {busy === s ? "Processing…" : `📄 ${s}`}
            </Button>
          ))}
        </div>
        {err && <p className="mt-3 text-xs text-red">{err}</p>}
      </div>
    );
  }

  if (dataset.status === "ERROR") {
    return (
      <div className="rounded-2xl border border-red/30 bg-red/5 p-6 text-sm text-red">
        Ingestion failed: {dataset.errorMessage ?? "unknown error"}
      </div>
    );
  }

  const schema = dataset.columnSchema ?? [];
  const rows = dataset.sampleRows ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {canAnalyze && (
          <Button variant="primary" onClick={analyze} disabled={!!busy}>
            {busy === "analyze" ? "Starting…" : "🔎 Analyze this dataset"}
          </Button>
        )}
        {canDelete && (
          <>
            <Button variant="ghost" size="sm" onClick={() => destroy(false)} disabled={!!busy}>
              Delete
            </Button>
            <Button variant="danger" size="sm" onClick={() => destroy(true)} disabled={!!busy}>
              Hard delete (GDPR)
            </Button>
          </>
        )}
        {err && <span className="text-xs text-red">{err}</span>}
      </div>

      {dataset.sampled && (
        <div className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-2.5 text-xs text-amber">
          ◍ Large file — a representative sample drawn from 12 regions across the whole file is
          analyzed. Aggregates are estimates; patterns and trends are reliable.
        </div>
      )}

      {(dataset.normalizations?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="mb-2 flex items-center gap-2">
            <span>🧹</span>
            <span className="text-sm font-semibold text-foreground">Data preparation</span>
            <span className="text-[11px] text-muted">— exactly what we changed, nothing hidden</span>
          </div>
          <ul className="space-y-1">
            {dataset.normalizations!.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <span className="mt-0.5 text-green">✓</span>
                {n.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-panel">
        <div className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">
          Sample preview <span className="text-xs font-normal text-muted">(first {rows.length} rows — this sample plus the schema is all the AI model ever sees)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {schema.map((c) => (
                  <th key={c.name} className="px-3 py-2 text-left align-top">
                    <div className="font-semibold text-foreground/90">{c.name}</div>
                    <div className="text-[10px] font-normal uppercase tracking-wide text-muted">{c.dtype}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  {schema.map((c) => (
                    <td key={c.name} className="max-w-[220px] truncate px-3 py-1.5 text-foreground/75" title={String(row[c.name] ?? "")}>
                      {String(row[c.name] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
