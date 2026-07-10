"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DayPoint } from "@/lib/insights";
import { fmtInt } from "@/lib/utils";
import { ChartTooltip, shortMD, useChartWidth } from "./chartShared";

const HEIGHT = 260;

type Mode = "daily" | "weekly";

interface Row {
  label: string;
  analyses: number;
  questions: number;
}

/** Bucket the 30 daily points into ~5 weeks of 7 days, summing each series. */
function toWeekly(data: DayPoint[]): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.slice(i, i + 7);
    if (!chunk.length) continue;
    out.push({
      label: `Wk ${shortMD(chunk[0].date)}`,
      analyses: chunk.reduce((s, d) => s + d.analyses, 0),
      questions: chunk.reduce((s, d) => s + d.questions, 0),
    });
  }
  return out;
}

export function ActivityChart({ data }: { data: DayPoint[] }) {
  const { ref, width } = useChartWidth<HTMLDivElement>();
  const [mode, setMode] = useState<Mode>("daily");

  const rows: Row[] = useMemo(
    () =>
      mode === "weekly"
        ? toWeekly(data)
        : data.map((d) => ({
            label: shortMD(d.date),
            analyses: d.analyses,
            questions: d.questions,
          })),
    [data, mode],
  );

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="text-sm font-semibold text-foreground">Activity</div>
        <div className="inline-flex rounded-lg border border-border bg-panel-2 p-0.5 text-xs">
          {(["daily", "weekly"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${
                mode === m
                  ? "bg-panel text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div ref={ref} className="w-full" style={{ height: HEIGHT }}>
        <AreaChart
          width={width}
          height={HEIGHT}
          data={rows}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="act-analyses" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="act-questions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--blue)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--muted)"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickMargin={8}
            minTickGap={mode === "daily" ? 24 : 8}
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
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
          <Area
            type="monotone"
            name="Analyses"
            dataKey="analyses"
            stroke="var(--accent)"
            strokeWidth={2.25}
            fill="url(#act-analyses)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            name="Questions"
            dataKey="questions"
            stroke="var(--blue)"
            strokeWidth={2.25}
            fill="url(#act-questions)"
            isAnimationActive={false}
          />
        </AreaChart>
      </div>
    </div>
  );
}
