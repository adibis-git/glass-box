"use client";

import { useState } from "react";
import { Mail, Building2, Clock } from "lucide-react";

export interface LeadRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
  role: string | null;
  message: string | null;
  source: string | null;
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED";
  createdAt: string; // ISO
}

const STATUSES: LeadRow["status"][] = ["NEW", "CONTACTED", "QUALIFIED", "CLOSED"];

const statusTone: Record<LeadRow["status"], string> = {
  NEW: "border-accent/40 bg-accent/15 text-accent",
  CONTACTED: "border-blue/40 bg-blue/15 text-blue",
  QUALIFIED: "border-green/40 bg-green/15 text-green",
  CLOSED: "border-border bg-panel-2 text-muted",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function LeadsTable({ initial }: { initial: LeadRow[] }) {
  const [leads, setLeads] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: LeadRow["status"]) {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)));
    setBusy(id);
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    if (!res.ok) setLeads(prev); // revert on failure
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-panel/40 p-12 text-center">
        <Mail className="mx-auto text-muted" size={28} />
        <p className="mt-3 text-sm text-muted">
          No leads yet. Submissions from the marketing site&apos;s demo and contact forms will
          appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leads.map((l) => (
        <div key={l.id} className="rounded-xl border border-border bg-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{l.name}</span>
                {l.role && <span className="text-xs text-muted">· {l.role}</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Mail size={12} /> {l.email}
                </a>
                {l.company && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 size={12} /> {l.company}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} /> {timeAgo(l.createdAt)}
                </span>
                {l.source && (
                  <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    {l.source}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={busy === l.id}
                  onClick={() => setStatus(l.id, s)}
                  className={`rounded-md border px-2 py-1 text-[10px] font-semibold tracking-wide transition-colors disabled:opacity-50 ${
                    l.status === s
                      ? statusTone[s]
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {l.message && (
            <p className="mt-3 rounded-lg border border-border bg-panel-2 p-3 text-sm leading-relaxed text-foreground/90">
              {l.message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
