import { fmtInt } from "@/lib/utils";
import type { DashboardMember } from "./types";

/** Up to two uppercase initials from a name (or the email local-part). */
function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Pure/presentational — rows are already sorted by analyses upstream. */
export function MostActiveTable({ members }: { members: DashboardMember[] }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="mb-4 text-sm font-semibold text-foreground">Most active</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted">
              <th className="pb-2 text-left font-semibold">Member</th>
              <th className="pb-2 text-right font-semibold">Analyses</th>
              <th className="pb-2 text-right font-semibold">Reports</th>
              <th className="pb-2 text-right font-semibold">Last active</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr
                key={m.userId}
                className="border-t border-border transition-colors hover:bg-panel-2"
              >
                <td className="py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
                      {initials(m.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-foreground">{m.name}</span>
                      {m.isManager && (
                        <span className="text-[10px] uppercase tracking-wider text-muted">
                          Manager
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 text-right font-mono text-foreground/80">
                  {fmtInt(m.analyses)}
                </td>
                <td className="py-2.5 text-right font-mono text-foreground/80">
                  {fmtInt(m.decisionReports)}
                </td>
                <td className="py-2.5 text-right text-muted">{m.lastActive ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
