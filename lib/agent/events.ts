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
