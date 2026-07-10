"use client";

import { useId } from "react";
import { Area, AreaChart } from "recharts";
import type { Trend } from "@/lib/insights";
import { fmtInt } from "@/lib/utils";
import { useChartWidth } from "./chartShared";

const SPARK_HEIGHT = 40;

export function StatCard({
  label,
  hint,
  icon,
  trend,
}: {
  label: string;
  hint?: string;
  icon: React.ReactNode;
  trend: Trend;
}) {
  const { ref, width } = useChartWidth<HTMLDivElement>(180);
  const gid = useId().replace(/[:]/g, "");

  // For every metric here, up = good, so a rise is green and a drop is red.
  const up = trend.pct !== null && trend.pct >= 0;
  const chipColor =
    trend.pct === null ? "var(--muted)" : up ? "var(--green)" : "var(--red)";

  const data = trend.spark.map((v, i) => ({ i, v }));

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </div>
        <span className="text-muted">{icon}</span>
      </div>

      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {fmtInt(trend.value)}
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs">
        {trend.pct === null ? (
          trend.currPeriod > 0 ? (
            <span className="font-medium" style={{ color: "var(--muted)" }}>
              new
            </span>
          ) : (
            <span className="text-muted">{hint ?? "no prior activity"}</span>
          )
        ) : (
          <>
            <span
              className="inline-flex items-center gap-0.5 font-semibold"
              style={{ color: chipColor }}
            >
              {up ? "▲" : "▼"} {Math.abs(trend.pct)}%
            </span>
            <span className="text-muted">vs prior 30 days</span>
          </>
        )}
      </div>

      {/* Tiny sparkline — no axes, no grid, no tooltip. */}
      <div ref={ref} className="mt-3 w-full" style={{ height: SPARK_HEIGHT }}>
        {data.some((d) => d.v > 0) && (
          <AreaChart
            width={width}
            height={SPARK_HEIGHT}
            data={data}
            margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chipColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={chipColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={chipColor}
              strokeWidth={1.75}
              fill={`url(#spark-${gid})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        )}
      </div>
    </div>
  );
}
