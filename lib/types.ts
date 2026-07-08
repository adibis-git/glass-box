// Shared types for Glass Box.

/** A single column of the uploaded dataset. */
export interface ColumnSchema {
  name: string;
  dtype: string; // inferred: "integer" | "float" | "boolean" | "datetime" | "string"
}

/** Everything the agent is told about the dataset. The raw CSV never leaves the browser. */
export interface DatasetSchema {
  columns: ColumnSchema[];
  rowCount: number;
  /** First 20 rows, sent to Claude as a sample. */
  sampleRows: Record<string, unknown>[];
}

/** A dataset ready for analysis: schema + the raw CSV text (kept client-side only). */
export interface Dataset {
  name: string;
  csv: string;
  schema: DatasetSchema;
  /** First 10 rows for the preview table. */
  previewRows: Record<string, unknown>[];
}

export type ChartType = "bar" | "line" | "scatter" | "pie" | "area";

/** Recharts-compatible chart spec authored by Claude via the render_chart tool. */
export interface ChartSpec {
  chart_type: ChartType;
  title: string;
  data: Record<string, unknown>[];
  x_key: string;
  y_keys: string[];
}

export type Confidence = "high" | "medium" | "low";

export interface Insight {
  finding: string;
  evidence: string;
  confidence: Confidence;
}

export interface ReportMetric {
  /** Short label, e.g. "Revenue growth" or "Top sector". */
  label: string;
  /** The headline value, pre-formatted, e.g. "+23.7%", "$2.6B", "Fintech". */
  value: string;
  trend?: "up" | "down" | "flat";
}

export interface FinalReport {
  /** One punchy sentence — the single most important takeaway. */
  headline: string;
  /** 2-3 sentence executive summary. */
  summary: string;
  /** 2-4 hero metrics rendered as big-number cards. */
  metrics: ReportMetric[];
  insights: Insight[];
  /** Optional concrete next step. */
  recommendation?: string;
}

// ---- Anthropic message shapes (minimal, matching the Messages API wire format) ----

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

// ---- Result of a Pyodide execution ----

export interface ExecResult {
  /** Text to hand back to Claude as the tool_result (stdout / repr / traceback). */
  output: string;
  isError: boolean;
  /** True when the code was rejected by the safety guardrail (shown in the audit trail). */
  blocked?: boolean;
  /** True when the execution exceeded the 15s budget and the worker was killed. */
  timedOut?: boolean;
}
