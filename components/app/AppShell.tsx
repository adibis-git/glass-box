"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { OrgSummary } from "@/lib/activeOrg";
import {
  Database,
  MessagesSquare,
  ChartColumn,
  Users,
  ScrollText,
  Settings,
  Snowflake,
  Sheet,
  Plus,
  ChevronDown,
  LogOut,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/app/datasets", label: "Datasets", icon: Database },
  { href: "/app/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/app/usage", label: "Usage", icon: ChartColumn },
  { href: "/app/members", label: "Members", icon: Users },
  { href: "/app/audit", label: "Audit log", icon: ScrollText },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

const CONNECTORS: { name: string; icon: LucideIcon }[] = [
  { name: "PostgreSQL", icon: Database },
  { name: "Snowflake", icon: Snowflake },
  { name: "Google Sheets", icon: Sheet },
];

function OrgSwitcher({ orgs, active }: { orgs: OrgSummary[]; active: OrgSummary }) {
  const { update } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function switchTo(org: OrgSummary) {
    if (org.id === active.id) return setOpen(false);
    setBusy(true);
    await update({ activeOrgId: org.id, activeRole: org.role });
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  async function createWorkspace() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.org?.id) {
        setErr(j.error ?? "Could not create workspace.");
        setBusy(false);
        return;
      }
      // Make the new workspace active (caller is its OWNER), then refresh.
      await update({ activeOrgId: j.org.id, activeRole: "OWNER" });
      setNewName("");
      setCreating(false);
      setOpen(false);
      setBusy(false);
      router.refresh();
    } catch {
      setErr("Could not create workspace.");
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-panel-2 px-3 py-2 text-left hover:border-muted/50"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{active.name}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">
            {active.role}
          </span>
        </span>
        <ChevronDown size={15} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-border bg-panel shadow-xl">
          {orgs.map((o) => (
            <button
              key={o.id}
              disabled={busy}
              onClick={() => switchTo(o)}
              className={cn(
                "block w-full px-3 py-2 text-left text-sm hover:bg-panel-2",
                o.id === active.id ? "text-accent" : "text-foreground/85",
              )}
            >
              {o.name}
              <span className="ml-2 text-[10px] uppercase text-muted">{o.role}</span>
            </button>
          ))}

          <div className="border-t border-border">
            {creating ? (
              <div className="p-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createWorkspace();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  placeholder="Workspace name"
                  disabled={busy}
                  className="h-8 w-full rounded-md border border-border bg-panel-2 px-2 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-accent/60"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    disabled={busy || !newName.trim()}
                    onClick={createWorkspace}
                    className="rounded-md bg-accent/20 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/30 disabled:opacity-50"
                  >
                    Create
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setCreating(false);
                      setErr(null);
                    }}
                    className="rounded-md px-2 py-1 text-xs text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
                {err && <div className="mt-1.5 text-[11px] text-red">{err}</div>}
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-foreground/70 hover:bg-panel-2 hover:text-foreground"
              >
                <Plus size={14} className="text-muted" /> New workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Shell({
  orgs,
  active,
  userName,
  userEmail,
  children,
}: {
  orgs: OrgSummary[];
  active: OrgSummary;
  userName: string | null;
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
        <Link href="/app" className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-accent/40 bg-accent/15 text-accent">
            <ScanSearch size={16} />
          </span>
          <span className="font-semibold tracking-tight text-foreground">Glass Box</span>
        </Link>

        <div className="px-3 pb-3">
          <OrgSwitcher orgs={orgs} active={active} />
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => {
            const activeNav = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm",
                  activeNav
                    ? "bg-accent/15 font-medium text-accent"
                    : "text-foreground/75 hover:bg-panel-2 hover:text-foreground",
                )}
              >
                <Icon size={16} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}

          {/* Connector teaser */}
          <div className="mt-6 px-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Data sources
            </div>
            <div className="mt-2 space-y-1">
              {CONNECTORS.map((c) => {
                const Icon = c.icon;
                return (
                <div
                  key={c.name}
                  className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-1.5 opacity-55"
                  title="Coming soon"
                >
                  <span className="flex items-center gap-2 text-xs text-foreground/70">
                    <Icon size={13} className="shrink-0" /> {c.name}
                  </span>
                  <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted">
                    Soon
                  </span>
                </div>
                );
              })}
            </div>
          </div>
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm text-foreground">{userName ?? userEmail}</div>
              <div className="truncate text-xs text-muted">{userEmail}</div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <ThemeToggle className="h-7 w-7" />
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-foreground"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

export function AppShell(props: {
  orgs: OrgSummary[];
  active: OrgSummary;
  userName: string | null;
  userEmail: string;
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <Shell {...props} />
    </SessionProvider>
  );
}
