"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { fmtInt } from "@/lib/utils";
import { ChartTooltip, useChartWidth } from "./chartShared";
import type { DashboardMember } from "./types";

const HEIGHT = 260;

/** First name / first token — falls back to the email local-part. */
function firstName(name: string): string {
  const token = name.trim().split(/[\s@]/)[0];
  return token || name;
}

export function TeamWorkloadChart({ members }: { members: DashboardMember[] }) {
  const { ref, width } = useChartWidth<HTMLDivElement>();
  const rows = members.map((m) => ({ name: firstName(m.name), analyses: m.analyses }));

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="mb-3 text-sm font-semibold text-foreground">Team workload</div>
      <div ref={ref} className="w-full" style={{ height: HEIGHT }}>
        <BarChart
          width={width}
          height={HEIGHT}
          data={rows}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="var(--muted)"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickMargin={8}
            interval={0}
          />
          <YAxis
            stroke="var(--muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
            tickFormatter={(v) => fmtInt(Number(v))}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "var(--muted)", fillOpacity: 0.08 }}
          />
          <Bar
            dataKey="analyses"
            name="Analyses"
            fill="var(--accent)"
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
            isAnimationActive={false}
          />
        </BarChart>
      </div>
    </div>
  );
}
