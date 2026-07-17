// Reliable final-report generation.
//
// The report is produced by a dedicated, non-streaming call (see the providers'
// generateReport) whose ONLY job is to return the report. That avoids the
// fragile in-loop tool-call argument streaming that could arrive empty. Whatever
// comes back is put through extractReport, which always yields a non-empty
// report — falling back to using the raw text as the summary if JSON is missing.

import type { Confidence, FinalReport, ReportMetric } from "@/lib/types";

/** JSON schema for the final_report tool (used by the Anthropic-direct path). */
export const REPORT_TOOL = {
  name: "final_report",
  description:
    "Conclude the analysis with a polished executive report. Call this after " +
    "4-8 meaningful analysis steps.",
  input_schema: {
    type: "object" as const,
    properties: {
      headline: {
        type: "string",
        description: "One punchy sentence — the single most important takeaway.",
      },
      summary: {
        type: "string",
        description: "A 2-3 sentence executive summary tying the findings together.",
      },
      metrics: {
        type: "array",
        description: "2-4 hero metrics for big-number cards.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Short label, e.g. 'Revenue growth'." },
            value: {
              type: "string",
              description: "Pre-formatted headline value, e.g. '+23.7%', '$2.6B', 'Fintech'.",
            },
            trend: { type: "string", enum: ["up", "down", "flat"] },
          },
          required: ["label", "value"],
        },
      },
      insights: {
        type: "array",
        description: "3-5 key findings, most important first.",
        items: {
          type: "object",
          properties: {
            finding: {
              type: "string",
              description: "A specific, quantified insight.",
            },
            evidence: { type: "string", description: "The numbers that back the finding." },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["finding", "evidence", "confidence"],
        },
      },
      recommendation: {
        type: "string",
        description: "Optional concrete next step or decision the data supports.",
      },
    },
    required: ["headline", "summary", "metrics", "insights"],
  },
};

/** The instruction appended when asking for the report as JSON (OpenRouter path). */
export const REPORT_INSTRUCTION = `Based on all the analysis above, produce the final executive report now.

Respond with ONLY a single JSON object (no markdown, no code fences, no prose before or after) of exactly this shape:
{
  "headline": "one punchy sentence — the single most important takeaway",
  "summary": "2-3 sentence executive summary",
  "metrics": [{"label": "Revenue growth", "value": "+23.7%", "trend": "up"}, ... 2-4 items ...],
  "insights": [{"finding": "specific quantified insight", "evidence": "the numbers behind it", "confidence": "high|medium|low"}, ... 3-5 items ...],
  "recommendation": "optional concrete next step"
}

Every value and finding must be concrete and quantified, drawn from the numbers you actually computed. Use "value" strings that are already formatted for display (e.g. "$2.6B", "+23.7%", "21%", "Fintech").`;

// Escape control characters that appear inside JSON string values (some models
// emit raw newlines there), leaving structural whitespace alone.
function repairJsonStrings(s: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (esc) {
      out += ch;
      esc = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      out += ch;
      continue;
    }
    if (inStr && (ch === "\n" || ch === "\r" || ch === "\t")) {
      out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : "\\t";
      continue;
    }
    out += ch;
  }
  return out;
}

function tryParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    /* try repair */
  }
  try {
    return JSON.parse(repairJsonStrings(s));
  } catch {
    return null;
  }
}

function coerceMetrics(v: unknown): ReportMetric[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((it): ReportMetric => {
      const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
      const t = o.trend;
      const trend =
        t === "up" || t === "down" || t === "flat" ? (t as ReportMetric["trend"]) : undefined;
      return {
        label: typeof o.label === "string" ? o.label : String(o.label ?? ""),
        value: typeof o.value === "string" ? o.value : String(o.value ?? ""),
        trend,
      };
    })
    .filter((m) => m.label && m.value)
    .slice(0, 4);
}

function coerceInsights(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => {
      const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
      const c = o.confidence;
      return {
        finding: typeof o.finding === "string" ? o.finding : String(o.finding ?? ""),
        evidence: typeof o.evidence === "string" ? o.evidence : String(o.evidence ?? ""),
        confidence: (c === "high" || c === "medium" || c === "low" ? c : "medium") as Confidence,
      };
    })
    .filter((i) => i.finding.trim());
}

/**
 * Render a FinalReport as compact text to fold into the conversation history.
 * The report is otherwise only stored for display (Message.report) and never
 * enters the apiMessages the model sees on the next turn — which made the model
 * unable to answer follow-ups about its own report (it would deny figures like
 * "GHS 9.5M" that only ever appeared in the report). Keeping it in history gives
 * the model memory of what it actually concluded.
 */
export function reportToHistoryText(report: FinalReport): string {
  const lines = [`[Final report I delivered]`, report.headline];
  if (report.summary) lines.push(report.summary);
  if (report.metrics?.length) {
    lines.push("Key metrics: " + report.metrics.map((m) => `${m.label}: ${m.value}`).join("; "));
  }
  if (report.insights?.length) {
    lines.push("Insights: " + report.insights.map((i) => i.finding).join(" | "));
  }
  if (report.recommendation) lines.push(`Recommendation: ${report.recommendation}`);
  return lines.join("\n");
}

/** Normalize an object (from a tool input or parsed JSON) into a FinalReport. */
export function normalizeReport(input: Record<string, unknown>): FinalReport {
  return {
    headline: typeof input.headline === "string" ? input.headline : "",
    summary: typeof input.summary === "string" ? input.summary : "",
    metrics: coerceMetrics(input.metrics),
    insights: coerceInsights(input.insights),
    recommendation:
      typeof input.recommendation === "string" && input.recommendation.trim()
        ? input.recommendation
        : undefined,
  };
}

/**
 * Turn a model's free-form report response into a FinalReport that is NEVER
 * empty. Handles raw JSON, JSON inside ```fences```, and stray prose around the
 * object; if no JSON can be recovered, uses the cleaned text as the summary.
 */
export function extractReport(text: string): FinalReport {
  const raw = (text ?? "").trim();

  // 1. direct / repaired parse
  let parsed = tryParse(raw);

  // 2. strip a ```json ... ``` fence
  if (!parsed) {
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) parsed = tryParse(fence[1].trim());
  }

  // 3. grab the outermost {...}
  if (!parsed) {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first !== -1 && last > first) parsed = tryParse(raw.slice(first, last + 1));
  }

  if (parsed) {
    const report = normalizeReport(parsed);
    if (report.summary.trim() || report.insights.length || report.headline.trim()) {
      return report;
    }
  }

  // 4. last-resort fallback: never empty — surface the model's prose as the summary
  const cleaned = raw.replace(/```[\s\S]*?```/g, "").replace(/[{}]/g, "").trim();
  return {
    headline: "Analysis complete",
    summary: cleaned.slice(0, 700) || "The analysis finished, but a structured summary could not be generated. See the reasoning feed for the full step-by-step analysis.",
    metrics: [],
    insights: [],
  };
}
