"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { fmtDate } from "@/lib/utils";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

interface Member {
  userId: string;
  name: string | null;
  email: string;
  role: Role;
}
interface Invitation {
  id: string;
  email: string;
  role: Role;
  acceptPath: string;
  expiresAt: string;
}

const ROLE_BADGE: Record<Role, string> = {
  OWNER: "bg-accent/15 text-accent border-accent/30",
  ADMIN: "bg-blue/15 text-blue border-blue/30",
  MEMBER: "bg-green/15 text-green border-green/30",
  VIEWER: "bg-muted/15 text-muted border-muted/30",
};

export function MembersManager({
  orgId,
  myUserId,
  myRole,
  members,
  invitations,
}: {
  orgId: string;
  myUserId: string;
  myRole: Role;
  members: Member[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const isAdmin = myRole === "ADMIN" || myRole === "OWNER";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    const res = await fetch(`/api/orgs/${orgId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Invite failed.");
    setMsg(`Invite link: ${location.origin}${j.acceptPath} (share it with ${email})`);
    setEmail("");
    router.refresh();
  }

  async function changeRole(userId: string, newRole: Role) {
    setErr(null);
    const res = await fetch(`/api/orgs/${orgId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Role change failed.");
    }
    router.refresh();
  }

  async function remove(userId: string) {
    setErr(null);
    const res = await fetch(`/api/orgs/${orgId}/members/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Remove failed.");
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <form onSubmit={invite} className="rounded-2xl border border-border bg-panel p-4">
          <div className="mb-2 text-sm font-semibold text-foreground">Invite someone</div>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="h-9 min-w-[220px] flex-1 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-accent/60"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-9 rounded-lg border border-border bg-panel-2 px-2 text-sm text-foreground outline-none"
            >
              <option value="ADMIN">Admin</option>
              <option value="MEMBER">Member</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <Button type="submit" variant="primary" size="sm" disabled={busy}>
              {busy ? "Inviting…" : "Invite"}
            </Button>
          </div>
          {msg && <p className="mt-2 break-all text-xs text-green">{msg}</p>}
          {err && <p className="mt-2 text-xs text-red">{err}</p>}
          <p className="mt-2 text-[11px] text-muted">
            Viewer: read-only · Member: upload &amp; analyze · Admin: manage members, deletion, audit
          </p>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-panel">
        {members.map((m) => (
          <div
            key={m.userId}
            className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-0"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {m.name ?? m.email}
                {m.userId === myUserId && <span className="ml-2 text-xs text-muted">(you)</span>}
              </div>
              <div className="truncate text-xs text-muted">{m.email}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isAdmin && m.userId !== myUserId ? (
                <>
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.userId, e.target.value as Role)}
                    className="h-8 rounded-lg border border-border bg-panel-2 px-2 text-xs text-foreground outline-none"
                  >
                    <option value="OWNER">Owner</option>
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                  <Button variant="ghost" size="sm" onClick={() => remove(m.userId)}>
                    Remove
                  </Button>
                </>
              ) : (
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${ROLE_BADGE[m.role]}`}
                >
                  {m.role}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {isAdmin && invitations.length > 0 && (
        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="mb-2 text-sm font-semibold text-foreground">Pending invitations</div>
          <ul className="space-y-1.5">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between text-xs">
                <span className="text-foreground/80">
                  {i.email} <span className="uppercase text-muted">· {i.role}</span>
                </span>
                <span className="text-muted">expires {fmtDate(i.expiresAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
