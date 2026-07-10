"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { fmtInt } from "@/lib/utils";
import { ChartTooltip, useChartWidth } from "./chartShared";

const HEIGHT = 220;

export function WorkDonut({ data, documents }: { data: number; documents: number }) {
  const { ref, width } = useChartWidth<HTMLDivElement>(280);
  const total = data + documents;

  const slices = [
    { name: "Data", value: data, color: "var(--accent)" },
    { name: "Documents", value: documents, color: "var(--blue)" },
  ];

  const pct = (v: number) => (total === 0 ? 0 : Math.round((v / total) * 100));

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="mb-3 text-sm font-semibold text-foreground">Data vs Documents</div>

      {total === 0 ? (
        <div className="py-10 text-center text-xs text-muted">No answers yet.</div>
      ) : (
        <>
          <div ref={ref} className="relative w-full" style={{ height: HEIGHT }}>
            <PieChart width={width} height={HEIGHT}>
              <Tooltip content={<ChartTooltip />} />
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={92}
                paddingAngle={2}
                stroke="var(--panel)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {slices.map((s) => (
                  <Cell key={s.name} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
            {/* Center total overlay. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-xl font-semibold tracking-tight text-foreground">
                {fmtInt(total)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted">answers</div>
            </div>
          </div>

          <ul className="mt-3 space-y-1.5 text-xs">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                <span className="text-muted">{s.name}</span>
                <span className="ml-auto font-medium text-foreground">
                  {fmtInt(s.value)} · {pct(s.value)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
