"use client";

// Shared client-side chart helpers for the dashboard. Mirrors ChartRenderer's
// width-measurement approach (a ref + ResizeObserver + state) instead of
// Recharts' ResponsiveContainer, which "can fail to mount" with several charts
// on screen. All colors come from CSS variables so charts are theme-aware.

import { useEffect, useRef, useState } from "react";
import { fmtInt } from "@/lib/utils";

/** Measure a container's width and hand explicit pixels to Recharts. Starts at a
 *  sane default so the chart always paints on first render, then tracks resize. */
export function useChartWidth<T extends HTMLElement>(initial = 600) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

interface TipItem {
  name?: string | number;
  value?: number | string;
  color?: string;
}

/** Themed tooltip matching ChartRenderer's CustomTooltip. */
export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TipItem[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-panel/95 px-3 py-2 shadow-xl backdrop-blur">
      {label !== undefined && (
        <div className="mb-1 text-[11px] font-medium text-muted">{String(label)}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto font-semibold text-foreground">
            {typeof p.value === "number" ? fmtInt(p.value) : String(p.value ?? "")}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Format a "YYYY-MM-DD" key as "M/D" without touching the timezone. */
export function shortMD(dateKey: string): string {
  const [, mm, dd] = dateKey.split("-");
  return `${Number(mm)}/${Number(dd)}`;
}
