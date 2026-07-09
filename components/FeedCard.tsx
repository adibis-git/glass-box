"use client";

import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { FeedItem } from "@/lib/feed";
import type { Confidence } from "@/lib/types";
import { cn } from "@/lib/utils";

// --- tiny inline markdown (bold + inline code), enough for the plan text ---
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      nodes.push(
        <strong key={`${keyBase}-b-${i}`} className="font-semibold text-foreground">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={`${keyBase}-c-${i}`}
          className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[0.85em] text-accent"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-foreground/90">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === "") return null;
        const bullet = /^([-*]|\d+\.)\s+/.test(trimmed);
        const content = bullet ? trimmed.replace(/^([-*]|\d+\.)\s+/, "") : trimmed;
        return (
          <p key={i} className={cn(bullet && "flex gap-2 pl-1")}>
            {bullet && <span className="text-accent">•</span>}
            <span>{renderInline(content, `l${i}`)}</span>
          </p>
        );
      })}
    </div>
  );
}

function CardShell({
  icon,
  label,
  labelClass,
  children,
  className,
}: {
  icon: string;
  label: string;
  labelClass?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "gb-in rounded-xl border border-border bg-panel p-4 shadow-sm",
        className,
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-base leading-none">{icon}</span>
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wider",
            labelClass ?? "text-muted",
          )}
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

const confidenceStyle: Record<Confidence, string> = {
  high: "bg-green/15 text-green border-green/30",
  medium: "bg-amber/15 text-amber border-amber/30",
  low: "bg-muted/15 text-muted border-muted/30",
};

export function FeedCard({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case "plan":
      return (
        <CardShell icon="🧠" label="Plan">
          <div className={cn(item.streaming && "gb-cursor")}>
            {item.text ? (
              <Markdown text={item.text} />
            ) : (
              <span className="text-sm text-muted">Thinking…</span>
            )}
          </div>
        </CardShell>
      );

    case "notice":
      return (
        <div
          className={cn(
            "gb-in rounded-xl border p-4",
            item.tone === "warning"
              ? "border-amber/40 bg-amber/10"
              : "border-blue/40 bg-blue/10",
          )}
        >
          <div className="flex items-start gap-2.5">
            <span className="text-base">{item.tone === "warning" ? "🚫" : "ℹ️"}</span>
            <p className={cn("text-sm leading-relaxed", item.tone === "warning" ? "text-amber" : "text-blue")}>
              {item.text}
            </p>
          </div>
        </div>
      );

    case "correction":
      return (
        <div className="gb-in rounded-xl border border-amber/50 bg-amber/10 p-4 shadow-[0_0_0_1px_rgba(244,179,80,0.15)]">
          <div className="flex items-center gap-2.5">
            <span className="gb-pulse text-lg">🔧</span>
            <div>
              <div className="text-sm font-semibold text-amber">
                Agent detected an error and is fixing it
              </div>
              <div className="text-xs text-amber/70">
                Reading the traceback and self-correcting…
              </div>
            </div>
          </div>
        </div>
      );

    case "code":
      return (
        <CardShell icon="💻" label={`Code · ${item.stepDescription}`}>
          <div className="overflow-hidden rounded-lg border border-border">
            <SyntaxHighlighter
              language="python"
              style={oneDark}
              customStyle={{
                margin: 0,
                background: "var(--panel-2)",
                fontSize: "12.5px",
                padding: "12px 14px",
              }}
              codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
            >
              {item.code}
            </SyntaxHighlighter>
          </div>
        </CardShell>
      );

    case "execution": {
      const badge = item.blocked
        ? { text: "Guardrail block", cls: "bg-red/15 text-red border-red/30" }
        : item.timedOut
          ? { text: "Timed out", cls: "bg-amber/15 text-amber border-amber/30" }
          : item.isError
            ? { text: "Error", cls: "bg-red/15 text-red border-red/30" }
            : { text: "Success", cls: "bg-green/15 text-green border-green/30" };
      return (
        <CardShell
          icon={item.isError ? "⛔" : "▶️"}
          label="Execution"
          labelClass={item.isError ? "text-red" : "text-muted"}
        >
          <div className="mb-2">
            <span
              className={cn(
                "inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                badge.cls,
              )}
            >
              {badge.text}
            </span>
          </div>
          <pre
            className={cn(
              "max-h-72 overflow-auto rounded-lg border border-border bg-panel-2 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap",
              item.isError ? "text-red/90" : "text-foreground/85",
            )}
          >
            {item.output}
          </pre>
        </CardShell>
      );
    }

    case "cite":
      return (
        <CardShell icon="📑" label={`Citation${item.section ? ` · ${item.section}` : ""}`}>
          <blockquote className="border-l-2 border-accent/60 pl-3 text-sm italic leading-relaxed text-foreground/90">
            “{item.quote}”
          </blockquote>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted">
            anchor {item.anchor}
          </div>
        </CardShell>
      );

    case "verification": {
      const passed = item.ok;
      const label = passed
        ? "Grounding check: passed"
        : `Grounding check: ${item.issues.length} issue${item.issues.length === 1 ? "" : "s"}`;
      return (
        <CardShell
          icon={passed ? "🛡️" : "⚠️"}
          label={label}
          labelClass={passed ? "text-green" : "text-amber"}
          className={passed ? "border-green/25" : "border-amber/40"}
        >
          {passed ? (
            <p className="text-xs text-muted">
              Every headline number and key claim was checked against the evidence.
            </p>
          ) : (
            <ul className="space-y-1">
              {item.issues.map((iss, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                  <span className="text-amber">•</span>
                  <span>{iss}</span>
                </li>
              ))}
              <li className="pt-1 text-[11px] text-muted">Unsupported claims were removed or softened.</li>
            </ul>
          )}
        </CardShell>
      );
    }

    case "insight":
      return (
        <CardShell
          icon="✅"
          label="Report ready"
          labelClass="text-green"
          className="border-green/30"
        >
          {item.report.headline && (
            <p className="mb-2.5 text-sm font-medium leading-snug text-foreground">
              {item.report.headline}
            </p>
          )}
          <ul className="space-y-1.5">
            {(item.report.insights ?? []).map((ins, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold uppercase",
                    confidenceStyle[ins.confidence],
                  )}
                >
                  {ins.confidence}
                </span>
                <span className="text-foreground/80">{ins.finding}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] text-muted">Full report in the results canvas →</p>
        </CardShell>
      );

    default:
      return null;
  }
}
