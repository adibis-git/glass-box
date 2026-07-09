// The AgentEvent vocabulary — the contract between the server agent loop, the
// SSE wire protocol, the persisted Message.events JSON, and the feed reducer.

import type { ChartSpec, FinalReport } from "@/lib/types";

export type AgentEvent =
  | { type: "plan_start"; id: string }
  | { type: "plan_delta"; id: string; delta: string }
  | { type: "plan_end"; id: string }
  | { type: "correction"; id: string }
  | { type: "code"; id: string; stepDescription: string; code: string }
  | {
      type: "execution";
      id: string;
      output: string;
      isError: boolean;
      blocked?: boolean;
      timedOut?: boolean;
    }
  | { type: "chart"; id: string; spec: ChartSpec }
  | {
      /**
       * A structured list compiled by the document engine's `extract` tool
       * (v3 §14.3) — e.g. every requirement, obligation, or price pulled from the
       * document. Emitted so the UI can render it as a table and offer a CSV
       * download; the same result is still fed back to the model. `rows` are
       * stringified and column-aligned to `columns`.
       */
      type: "extract";
      id: string;
      title: string;
      columns: string[];
      rows: string[][];
    }
  | {
      /**
       * A citation recorded by the document engine — the doc-mode "glass box"
       * equivalent of showing executed Python (v3 §14.3). `anchor` is the token
       * the model echoed from a retrieved passage; `section` is its nearest
       * heading (for a human-readable label).
       */
      type: "cite";
      id: string;
      anchor: string;
      quote: string;
      section?: string;
    }
  | {
      /** Prominent inline notice — e.g. an out-of-scope refusal. */
      type: "notice";
      id: string;
      tone: "info" | "warning";
      text: string;
    }
  | { type: "report_pending" }
  | {
      /**
       * Grounding-verifier result (v3 §16.2) — a cheap check that every headline
       * number and key claim in the report is supported by the run's evidence.
       * Emitted just before the report for decision / document_review runs.
       */
      type: "verification";
      id: string;
      ok: boolean;
      issues: string[];
    }
  | { type: "report"; id: string; report: FinalReport }
  | {
      /** Suggested next-step questions, emitted after the run settles (v3 §5). */
      type: "suggestions";
      id: string;
      questions: string[];
    }
  | { type: "step"; current: number; max: number }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | {
      type: "status";
      status: "running" | "done" | "error";
      message?: string;
      canRetry?: boolean;
    };
