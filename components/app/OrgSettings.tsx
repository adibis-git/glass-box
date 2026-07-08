"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export function OrgSettings({
  org,
  myRole,
}: {
  org: { id: string; name: string; slug: string; retentionDays: number | null };
  myRole: Role;
}) {
  const router = useRouter();
  const isOwner = myRole === "OWNER";
  const isAdmin = isOwner || myRole === "ADMIN";

  const [name, setName] = useState(org.name);
  const [retention, setRetention] = useState(org.retentionDays?.toString() ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");

  async function save() {
    setMsg(null); setErr(null);
    const body: Record<string, unknown> = {};
    if (isOwner && name.trim() !== org.name) body.name = name.trim();
    const r = retention.trim() === "" ? null : parseInt(retention, 10);
    if (isAdmin && r !== org.retentionDays) body.retentionDays = r;
    if (Object.keys(body).length === 0) return setMsg("Nothing to save.");

    const res = await fetch(`/api/orgs/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(j.error ?? "Save failed.");
    setMsg("Saved.");
    router.refresh();
  }

  async function destroy() {
    setErr(null);
    const res = await fetch(`/api/orgs/${org.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return setErr(j.error ?? "Delete failed.");
    }
    window.location.href = "/app";
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-panel p-5">
        <div className="mb-3 text-sm font-semibold text-foreground">Workspace</div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Name (owner only)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isOwner}
            className="h-9 w-full max-w-sm rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground outline-none focus:border-accent/60 disabled:opacity-50"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">
            Data retention, days (admin+; blank = keep until deleted)
          </span>
          <input
            value={retention}
            onChange={(e) => setRetention(e.target.value.replace(/[^0-9]/g, ""))}
            disabled={!isAdmin}
            placeholder="e.g. 90"
            className="h-9 w-full max-w-[140px] rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground outline-none focus:border-accent/60 disabled:opacity-50"
          />
        </label>
        <p className="mt-2 text-[11px] text-muted">
          When set, datasets are hard-deleted (rows + stored files) that many days after upload.
          Deletions run daily and are recorded in the audit log.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={save} disabled={!isAdmin}>
            Save changes
          </Button>
          {msg && <span className="text-xs text-green">{msg}</span>}
          {err && <span className="text-xs text-red">{err}</span>}
        </div>
      </div>

      {isOwner && (
        <div className="rounded-2xl border border-red/30 bg-red/5 p-5">
          <div className="mb-1 text-sm font-semibold text-red">Danger zone</div>
          <p className="text-xs text-muted">
            Deleting the workspace permanently removes all datasets, stored files, conversations,
            reports, members, and the audit trail. This cannot be undone.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.value)}
              placeholder={`Type "${org.slug}" to confirm`}
              className="h-9 w-full max-w-xs rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-red/60"
            />
            <Button
              variant="danger"
              size="sm"
              disabled={confirmDelete !== org.slug}
              onClick={destroy}
            >
              Delete workspace
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
