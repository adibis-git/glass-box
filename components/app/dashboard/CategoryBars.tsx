import { fmtInt } from "@/lib/utils";

export interface CategoryItem {
  label: string;
  value: number;
  color?: string; // CSS var string, defaults to the accent
}

/** A clean, theme-aware horizontal bar list. Used for the intent + effort mixes.
 *  Pure/presentational — safe to render on the server. */
export function CategoryBars({
  title,
  items,
}: {
  title: string;
  items: CategoryItem[];
}) {
  const total = items.reduce((s, r) => s + r.value, 0);
  const max = Math.max(1, ...items.map((r) => r.value));

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="mb-4 text-sm font-semibold text-foreground">{title}</div>
      {total === 0 ? (
        <div className="py-4 text-center text-xs text-muted">No analyses yet.</div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((r) => {
            const width = Math.round((r.value / max) * 100);
            const share = Math.round((r.value / total) * 100);
            return (
              <li key={r.label} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0 truncate text-muted">{r.label}</span>
                <span className="relative h-4 flex-1 overflow-hidden rounded bg-panel-2">
                  <span
                    className="absolute inset-y-0 left-0 rounded"
                    style={{
                      width: `${width}%`,
                      background: r.color ?? "var(--accent)",
                      opacity: 0.75,
                    }}
                    aria-hidden
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-foreground/80">
                  {fmtInt(r.value)}
                </span>
                <span className="w-9 shrink-0 text-right text-muted">{share}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
