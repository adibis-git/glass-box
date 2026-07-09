"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/types";

const PALETTE = ["#e0885f", "#74a0ff", "#4ade80", "#f4b350", "#c084fc", "#22d3ee", "#f26d6d"];
const HEIGHT = 300;

// Axis/grid are surface chrome (not data) — read from theme tokens.
const axisStyle = { stroke: "var(--muted)", fontSize: 11 };
const gridStyle = { stroke: "var(--border)" };

/** Compact number formatting: 1.2k / 3.4M / 2.1B, else up to 2 decimals. */
function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a < 1e10 ? 1 : 0) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(a < 1e7 ? 1 : 0) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(a < 1e4 ? 1 : 0) + "k";
  return String(Math.round(n * 100) / 100);
}

function coerce(data: Record<string, unknown>[], keys: string[]) {
  return data.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const k of keys) {
      const v = row[k];
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
        out[k] = Number(v);
      }
    }
    return out;
  });
}

interface TipItem {
  name?: string | number;
  value?: number | string;
  color?: string;
}
function CustomTooltip({
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
          <span className="ml-auto font-semibold text-foreground">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Measure the container width and pass explicit pixel dimensions to Recharts —
 * more reliable than ResponsiveContainer, which can fail to mount with several
 * charts on screen. Starts at a sane default so it always renders on first paint. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
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

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const { chart_type, data, x_key, y_keys } = spec;
  const cleaned = coerce(data, y_keys);
  const { ref, width } = useWidth<HTMLDivElement>();
  const gid = useId().replace(/[:]/g, "");
  const dims = { width, height: HEIGHT };

  const grad = (i: number) => `grad-${gid}-${i}`;
  const defs = (
    <defs>
      {y_keys.map((_, i) => {
        const c = PALETTE[i % PALETTE.length];
        return (
          <linearGradient key={i} id={grad(i)} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={0.95} />
            <stop offset="100%" stopColor={c} stopOpacity={chart_type === "area" ? 0.05 : 0.55} />
          </linearGradient>
        );
      })}
    </defs>
  );

  const axes = (
    <>
      <CartesianGrid {...gridStyle} strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey={x_key}
        {...axisStyle}
        tickLine={false}
        axisLine={{ stroke: "var(--border)" }}
        tickMargin={8}
      />
      <YAxis
        {...axisStyle}
        tickLine={false}
        axisLine={false}
        width={44}
        tickFormatter={(v) => fmt(v)}
      />
      <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted)", fillOpacity: 0.08 }} />
      {y_keys.length > 1 && (
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
      )}
    </>
  );

  const anim = { isAnimationActive: true, animationDuration: 650 };

  function renderChart() {
    if (chart_type === "line") {
      return (
        <LineChart {...dims} data={cleaned} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          {axes}
          {y_keys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              {...anim}
            />
          ))}
        </LineChart>
      );
    }
    if (chart_type === "area") {
      return (
        <AreaChart {...dims} data={cleaned} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          {defs}
          {axes}
          {y_keys.map((k, i) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2.5}
              fill={`url(#${grad(i)})`}
              {...anim}
            />
          ))}
        </AreaChart>
      );
    }
    if (chart_type === "scatter") {
      return (
        <ScatterChart {...dims} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridStyle} strokeDasharray="3 3" />
          <XAxis dataKey={x_key} type="number" name={x_key} {...axisStyle} tickLine={false} tickFormatter={(v) => fmt(v)} />
          <YAxis dataKey={y_keys[0]} type="number" name={y_keys[0]} {...axisStyle} tickLine={false} width={44} tickFormatter={(v) => fmt(v)} />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={cleaned} fill={PALETTE[0]} {...anim} />
        </ScatterChart>
      );
    }
    if (chart_type === "pie") {
      return (
        <PieChart {...dims}>
          <Tooltip content={<CustomTooltip />} />
          <Pie
            data={cleaned}
            dataKey={y_keys[0]}
            nameKey={x_key}
            cx="50%"
            cy="50%"
            outerRadius={100}
            innerRadius={55}
            paddingAngle={2}
            stroke="var(--background)"
            strokeWidth={2}
            {...anim}
          >
            {cleaned.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
        </PieChart>
      );
    }
    // bar (default)
    return (
      <BarChart {...dims} data={cleaned} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
        {defs}
        {axes}
        {y_keys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={`url(#${grad(i)})`} radius={[4, 4, 0, 0]} maxBarSize={56} {...anim}>
            {y_keys.length === 1 && (
              <LabelList
                dataKey={k}
                position="top"
                formatter={(value) => fmt(value)}
                style={{ fill: "var(--muted)", fontSize: 10, fontWeight: 600 }}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    );
  }

  return (
    <div className="gb-in overflow-hidden rounded-2xl border border-border bg-panel p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[0] }} />
        <span className="truncate text-sm font-semibold text-foreground">{spec.title}</span>
      </div>
      {/* Width is measured from this container (responsive); height is fixed so
          the chart keeps a sensible min-height on small screens. */}
      <div ref={ref} className="w-full" style={{ height: HEIGHT, minHeight: HEIGHT }}>
        {renderChart()}
      </div>
    </div>
  );
}
