"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { fmtInt } from "@/lib/utils";

interface DatasetOption {
  id: string;
  name: string;
  rowCount: number | null;
}

function defaultAlias(name: string, taken: Set<string>): string {
  let base = name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20);
  if (!base || /^[0-9]/.test(base)) base = `df_${base}`;
  let alias = base;
  let n = 2;
  while (taken.has(alias)) alias = `${base}_${n++}`;
  return alias;
}

export function NewConversation({
  orgId,
  datasets,
}: {
  orgId: string;
  datasets: DatasetOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Map<string, string>>(new Map()); // datasetId → alias
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(d: DatasetOption) {
    const next = new Map(selected);
    if (next.has(d.id)) {
      next.delete(d.id);
    } else if (next.size < 4) {
      const taken = new Set(next.values());
      next.set(d.id, next.size === 0 ? "df" : defaultAlias(d.name, taken));
    }
    setSelected(next);
  }

  function setAlias(id: string, alias: string) {
    const next = new Map(selected);
    next.set(id, alias.replace(/[^A-Za-z0-9_]/g, ""));
    setSelected(next);
  }

  async function create() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/orgs/${orgId}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datasets: [...selected.entries()].map(([datasetId, alias]) => ({ datasetId, alias })),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Could not create the conversation.");
    router.push(`/app/conversations/${j.conversation.id}`);
  }

  if (!open) {
    return (
      <Button variant="primary" size="sm" onClick={() => setOpen(true)} disabled={datasets.length === 0}>
        + New conversation
      </Button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-border bg-panel p-4">
      <div className="mb-1 text-sm font-semibold text-foreground">New conversation</div>
      <p className="mb-3 text-xs text-muted">
        Pick 1–4 datasets. With several, the agent can join them — each gets a Python variable name.
      </p>
      <div className="space-y-1.5">
        {datasets.map((d) => {
          const checked = selected.has(d.id);
          return (
            <div
              key={d.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                checked ? "border-accent/50 bg-accent/5" : "border-border bg-panel-2"
              }`}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={checked} onChange={() => toggle(d)} className="accent-[#e0885f]" />
                <span className="truncate text-sm text-foreground">{d.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {d.rowCount ? `${fmtInt(d.rowCount)} rows` : ""}
                </span>
              </label>
              {checked && (
                <input
                  value={selected.get(d.id) ?? ""}
                  onChange={(e) => setAlias(d.id, e.target.value)}
                  className="h-7 w-28 rounded border border-border bg-panel px-2 font-mono text-xs text-foreground outline-none focus:border-accent/60"
                  title="Python variable name"
                />
              )}
            </div>
          );
        })}
      </div>
      {err && <p className="mt-2 text-xs text-red">{err}</p>}
      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={create} disabled={busy || selected.size === 0}>
          {busy ? "Creating…" : `Start with ${selected.size} dataset${selected.size === 1 ? "" : "s"}`}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
