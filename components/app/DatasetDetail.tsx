"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

interface DocInfo {
  docType: string;
  description: string;
  pageCount: number;
  wordCount: number;
  keyEntities: string[];
  sections: string[];
}

interface DatasetProp {
  id: string;
  name: string;
  kind: "TABULAR" | "DOCUMENT";
  status: string;
  availableSheets: string[] | null;
  columnSchema: { name: string; dtype: string }[] | null;
  sampleRows: Record<string, unknown>[] | null;
  normalizations: { kind: string; detail: string }[] | null;
  sampled: boolean;
  errorMessage: string | null;
  doc: DocInfo | null;
}

interface VersionProp {
  version: number;
  originalFilename: string;
  rowCount: number | null;
  status: string;
  sampled: boolean;
  createdAt: string;
}

interface TabularCompare {
  kind?: "tabular";
  from: { version: number; rowCount: number | null; columnCount: number };
  to: { version: number; rowCount: number | null; columnCount: number };
  rowCountDelta: number | null;
  columns: {
    added: string[];
    removed: string[];
    renamed: { from: string; to: string }[];
    typeChanged: { name: string; from: string; to: string }[];
  };
  summary: string;
}

interface DocumentCompare {
  kind: "document";
  from: { version: number; sectionCount: number; wordCount: number };
  to: { version: number; sectionCount: number; wordCount: number };
  sections: { added: string[]; removed: string[]; modified: string[] };
  summary: string;
}

type CompareResult = TabularCompare | DocumentCompare;

export function DatasetDetail({
  orgId,
  myRole,
  dataset,
  versions = [],
}: {
  orgId: string;
  myRole: Role;
  dataset: DatasetProp;
  versions?: VersionProp[];
}) {
  const router = useRouter();
  const canAnalyze = myRole !== "VIEWER";
  const canDelete = myRole === "ADMIN" || myRole === "OWNER";
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadVersion(file: File) {
    setBusy("version");
    setErr(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/orgs/${orgId}/sources/${dataset.id}/versions`, {
      method: "POST",
      body: form,
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) return setErr(j.error ?? "Could not upload the new version.");
    router.refresh();
  }

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

      {err && busy !== "analyze" && <p className="text-xs text-red">{err}</p>}

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

      <VersionsPanel
        orgId={orgId}
        sourceId={dataset.id}
        kind={dataset.kind}
        versions={versions}
        canUpload={canAnalyze}
        onUpload={(f) => uploadVersion(f)}
        uploading={busy === "version"}
        fileRef={fileRef}
      />

      {dataset.kind === "DOCUMENT" ? (
        dataset.doc && <DocumentProfileCard doc={dataset.doc} />
      ) : (
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
      )}
    </div>
  );
}

/** Document domain-read summary — the doc-mode equivalent of the sample preview. */
function DocumentProfileCard({ doc }: { doc: DocInfo }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="mb-2 flex items-center gap-2">
        <span>📄</span>
        <span className="text-sm font-semibold text-foreground">Document profile</span>
        <span className="rounded border border-blue/30 bg-blue/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue">
          {doc.docType}
        </span>
        <span className="text-[11px] text-muted">
          {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"} · {doc.wordCount.toLocaleString()} words
        </span>
      </div>
      {doc.description && <p className="mb-3 text-sm text-foreground/85">{doc.description}</p>}
      {doc.keyEntities.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Key entities</div>
          <div className="flex flex-wrap gap-1.5">
            {doc.keyEntities.map((e) => (
              <span key={e} className="rounded border border-border bg-panel-2 px-2 py-0.5 text-xs text-foreground/80">
                {e}
              </span>
            ))}
          </div>
        </div>
      )}
      {doc.sections.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Outline ({doc.sections.length} section{doc.sections.length === 1 ? "" : "s"})
          </div>
          <ul className="max-h-64 space-y-0.5 overflow-auto text-xs text-foreground/75">
            {doc.sections.slice(0, 60).map((s, i) => (
              <li key={i} className="truncate">• {s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Version history + "upload a new version" + a two-version compare tool (v3 §15). */
function VersionsPanel({
  orgId,
  sourceId,
  kind,
  versions,
  canUpload,
  onUpload,
  uploading,
  fileRef,
}: {
  orgId: string;
  sourceId: string;
  kind: "TABULAR" | "DOCUMENT";
  versions: VersionProp[];
  canUpload: boolean;
  onUpload: (f: File) => void;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const accept = kind === "DOCUMENT" ? ".pdf,.docx,.doc,.txt,.md" : ".csv,.tsv,.txt,.xlsx,.xls";
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>🗂️</span>
          <span className="text-sm font-semibold text-foreground">Versions</span>
          <span className="text-[11px] text-muted">— every revision is kept and comparable</span>
        </div>
        {canUpload && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
            <Button variant="secondary" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "Uploading…" : "⬆ Upload new version"}
            </Button>
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-medium">Version</th>
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Rows</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Added</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.version} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 font-mono text-foreground/90">v{v.version}</td>
                <td className="px-3 py-2 text-foreground/75">
                  {v.originalFilename}
                  {v.sampled ? " · sampled" : ""}
                </td>
                <td className="px-3 py-2 text-foreground/75">{v.rowCount != null ? v.rowCount.toLocaleString() : "—"}</td>
                <td className="px-3 py-2 text-foreground/75">{v.status.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 text-muted">{new Date(v.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {versions.length >= 2 && <CompareTool orgId={orgId} sourceId={sourceId} versions={versions} />}
    </div>
  );
}

function CompareTool({
  orgId,
  sourceId,
  versions,
}: {
  orgId: string;
  sourceId: string;
  versions: VersionProp[];
}) {
  const nums = versions.map((v) => v.version).sort((a, b) => a - b);
  const [from, setFrom] = useState(nums[0]);
  const [to, setTo] = useState(nums[nums.length - 1]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);

  async function compare() {
    setBusy(true);
    setErr(null);
    setResult(null);
    const res = await fetch(`/api/orgs/${orgId}/sources/${sourceId}/compare?from=${from}&to=${to}`);
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Compare failed.");
    setResult(j.comparison as CompareResult);
  }

  const isDoc = result?.kind === "document";
  const tab = result && !isDoc ? (result as TabularCompare) : null;
  const doc = isDoc ? (result as DocumentCompare) : null;
  return (
    <div className="mt-4 rounded-xl border border-border bg-panel-2/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground">Compare</span>
        <select
          value={from}
          onChange={(e) => setFrom(Number(e.target.value))}
          className="h-8 rounded border border-border bg-panel px-2 font-mono text-xs text-foreground outline-none focus:border-accent/60"
        >
          {nums.map((n) => (
            <option key={n} value={n}>v{n}</option>
          ))}
        </select>
        <span className="text-xs text-muted">→</span>
        <select
          value={to}
          onChange={(e) => setTo(Number(e.target.value))}
          className="h-8 rounded border border-border bg-panel px-2 font-mono text-xs text-foreground outline-none focus:border-accent/60"
        >
          {nums.map((n) => (
            <option key={n} value={n}>v{n}</option>
          ))}
        </select>
        <Button variant="secondary" size="sm" disabled={busy || from === to} onClick={compare}>
          {busy ? "Comparing…" : "Compare versions"}
        </Button>
      </div>
      {err && <p className="mt-2 text-xs text-red">{err}</p>}
      {tab && (
        <div className="mt-3 space-y-2 text-xs">
          {tab.summary && (
            <p className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-foreground/90">
              {tab.summary}
            </p>
          )}
          <div className="flex flex-wrap gap-3 text-foreground/75">
            <span>
              Rows: {tab.from.rowCount?.toLocaleString() ?? "—"} → {tab.to.rowCount?.toLocaleString() ?? "—"}
              {tab.rowCountDelta != null && (
                <span className={tab.rowCountDelta >= 0 ? "text-green" : "text-red"}>
                  {" "}({tab.rowCountDelta >= 0 ? "+" : ""}{tab.rowCountDelta.toLocaleString()})
                </span>
              )}
            </span>
            <span>Columns: {tab.from.columnCount} → {tab.to.columnCount}</span>
          </div>
          {tab.columns.added.length > 0 && <p><span className="text-green">+ Added:</span> {tab.columns.added.join(", ")}</p>}
          {tab.columns.removed.length > 0 && <p><span className="text-red">− Removed:</span> {tab.columns.removed.join(", ")}</p>}
          {tab.columns.renamed.length > 0 && (
            <p><span className="text-amber">↳ Renamed:</span> {tab.columns.renamed.map((r) => `${r.from}→${r.to}`).join(", ")}</p>
          )}
          {tab.columns.typeChanged.length > 0 && (
            <p><span className="text-blue">⇄ Type changed:</span> {tab.columns.typeChanged.map((t) => `${t.name} (${t.from}→${t.to})`).join(", ")}</p>
          )}
          {tab.columns.added.length + tab.columns.removed.length + tab.columns.renamed.length + tab.columns.typeChanged.length === 0 && (
            <p className="text-muted">No schema changes between these versions.</p>
          )}
        </div>
      )}
      {doc && (
        <div className="mt-3 space-y-2 text-xs">
          {doc.summary && (
            <p className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-foreground/90">
              {doc.summary}
            </p>
          )}
          <div className="flex flex-wrap gap-3 text-foreground/75">
            <span>Sections: {doc.from.sectionCount} → {doc.to.sectionCount}</span>
            <span>Words: {doc.from.wordCount.toLocaleString()} → {doc.to.wordCount.toLocaleString()}</span>
          </div>
          {doc.sections.added.length > 0 && <p><span className="text-green">+ Added:</span> {doc.sections.added.join(", ")}</p>}
          {doc.sections.removed.length > 0 && <p><span className="text-red">− Removed:</span> {doc.sections.removed.join(", ")}</p>}
          {doc.sections.modified.length > 0 && <p><span className="text-amber">✎ Modified:</span> {doc.sections.modified.join(", ")}</p>}
          {doc.sections.added.length + doc.sections.removed.length + doc.sections.modified.length === 0 && (
            <p className="text-muted">No section-level changes between these versions.</p>
          )}
        </div>
      )}
    </div>
  );
}
