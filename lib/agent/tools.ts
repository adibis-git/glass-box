// Tool definitions for the agent loop, in Anthropic Messages API shape.
// Execution happens client-side (Pyodide) or in the UI (charts / report) —
// never on the server.

import type { ChartType, Confidence } from "@/lib/types";
import { REPORT_TOOL } from "@/lib/agent/report";

export interface RunPythonInput {
  code: string;
  step_description: string;
}

export interface RenderChartInput {
  chart_type: ChartType;
  title: string;
  data: Record<string, unknown>[];
  x_key: string;
  y_keys: string[];
}

export interface FinalReportInput {
  insights: { finding: string; evidence: string; confidence: Confidence }[];
  summary: string;
}

export const RUN_PYTHON_TOOL = {
  name: "run_python",
  description:
    "Execute Python code against the loaded dataset. The dataframe is pre-loaded as `df`. " +
    "pandas (as `pd`) and numpy (as `np`) are available — do NOT import anything and do NOT " +
    "read files. Only what you print() is returned to you, so print the intermediate results " +
    "you need to reason about. Returns stdout, or the full traceback if the code errors.",
  input_schema: {
    type: "object" as const,
    properties: {
      code: {
        type: "string",
        description:
          "Python code to run. Operate on `df`. Keep it to ONE focused analysis step and " +
          "print the results you want to observe.",
      },
      step_description: {
        type: "string",
        description:
          "A short human-readable label for this step, e.g. 'Aggregate funding by sector'.",
      },
    },
    required: ["code", "step_description"],
  },
};

export const RENDER_CHART_TOOL = {
  name: "render_chart",
  description:
    "Render a chart in the UI from Recharts-compatible JSON. Prefer this over describing " +
    "numbers in prose whenever a visual is clearer — aim for 2-4 charts across the analysis. " +
    "Provide already-aggregated data (an array of row objects), the x-axis key, and one or " +
    "more y-axis keys to plot. CRITICAL: every label and value in `data` MUST be copied " +
    "verbatim from a print() output you have already seen in this conversation — never " +
    "retype or reconstruct numbers from memory. If you only want to show some categories, " +
    "print just those categories first (e.g. `print(summary.loc[['TRANSFER','CASH_OUT']])`), " +
    "then copy that exact printed table into the chart. Double-check each label matches the " +
    "value it was printed with before calling this tool.",
  input_schema: {
    type: "object" as const,
    properties: {
      chart_type: {
        type: "string",
        enum: ["bar", "line", "scatter", "pie", "area"],
        description:
          "The chart type best suited to the data: line/area for trends over time, bar for " +
          "comparisons across categories, pie for composition, scatter for relationships.",
      },
      title: { type: "string", description: "A concise, descriptive chart title." },
      data: {
        type: "array",
        description:
          "Array of row objects, each containing the x_key and every y_key. Keep it to the " +
          "aggregated rows you want to plot (typically <= 50).",
        items: { type: "object", additionalProperties: true },
      },
      x_key: { type: "string", description: "The object key for the x-axis / category." },
      y_keys: {
        type: "array",
        items: { type: "string" },
        description: "One or more object keys to plot on the y-axis.",
      },
    },
    required: ["chart_type", "title", "data", "x_key", "y_keys"],
  },
};

export const AGENT_TOOLS = [RUN_PYTHON_TOOL, RENDER_CHART_TOOL, REPORT_TOOL];
