// Reasoning-feed state + reducer. Maps the orchestrator's AgentEvent stream into
// the chronological feed (left panel) and the results-canvas state (right panel).

import type { AgentEvent } from "@/lib/agent/events";
import type { ChartSpec, FinalReport } from "@/lib/types";

export type FeedItem =
  | { kind: "plan"; id: string; text: string; streaming: boolean }
  | { kind: "notice"; id: string; tone: "info" | "warning"; text: string }
  | { kind: "correction"; id: string }
  | { kind: "code"; id: string; stepDescription: string; code: string }
  | {
      kind: "execution";
      id: string;
      output: string;
      isError: boolean;
      blocked?: boolean;
      timedOut?: boolean;
    }
  | { kind: "cite"; id: string; anchor: string; quote: string; section?: string }
  | { kind: "verification"; id: string; ok: boolean; issues: string[] }
  | { kind: "insight"; id: string; report: FinalReport };

export type RunStatus = "idle" | "running" | "done" | "error";

export interface CanvasChart {
  id: string;
  spec: ChartSpec;
}

export interface FeedState {
  feed: FeedItem[];
  charts: CanvasChart[];
  report: FinalReport | null;
  /** Out-of-scope refusal (or similar) surfaced prominently in the results view. */
  notice: { tone: "info" | "warning"; text: string } | null;
  composingReport: boolean;
  step: { current: number; max: number } | null;
  usage: { input: number; output: number };
  status: RunStatus;
  error: string | null;
}

export const initialFeedState: FeedState = {
  feed: [],
  charts: [],
  report: null,
  notice: null,
  composingReport: false,
  step: null,
  usage: { input: 0, output: 0 },
  status: "idle",
  error: null,
};

export type FeedAction = AgentEvent | { type: "begin" } | { type: "reset" };

export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case "reset":
      return { ...initialFeedState };
    case "begin":
      return { ...initialFeedState, status: "running" };

    case "plan_start":
      return {
        ...state,
        feed: [
          ...state.feed,
          { kind: "plan", id: action.id, text: "", streaming: true },
        ],
      };
    case "plan_delta":
      return {
        ...state,
        feed: state.feed.map((f) =>
          f.kind === "plan" && f.id === action.id
            ? { ...f, text: f.text + action.delta }
            : f,
        ),
      };
    case "plan_end":
      return {
        ...state,
        feed: state.feed
          .map((f) =>
            f.kind === "plan" && f.id === action.id
              ? { ...f, streaming: false }
              : f,
          )
          // Drop plan cards that never received any text (e.g. a forced tool turn).
          .filter((f) => !(f.kind === "plan" && f.text.trim() === "")),
      };

    case "correction":
      return {
        ...state,
        feed: [...state.feed, { kind: "correction", id: action.id }],
      };

    case "code":
      return {
        ...state,
        feed: [
          ...state.feed,
          {
            kind: "code",
            id: action.id,
            stepDescription: action.stepDescription,
            code: action.code,
          },
        ],
      };

    case "execution":
      return {
        ...state,
        feed: [
          ...state.feed,
          {
            kind: "execution",
            id: action.id,
            output: action.output,
            isError: action.isError,
            blocked: action.blocked,
            timedOut: action.timedOut,
          },
        ],
      };

    case "chart":
      return {
        ...state,
        charts: [...state.charts, { id: action.id, spec: action.spec }],
      };

    case "cite":
      return {
        ...state,
        feed: [
          ...state.feed,
          {
            kind: "cite",
            id: action.id,
            anchor: action.anchor,
            quote: action.quote,
            section: action.section,
          },
        ],
      };

    case "notice":
      return {
        ...state,
        notice: { tone: action.tone, text: action.text },
        feed: [
          ...state.feed,
          { kind: "notice", id: action.id, tone: action.tone, text: action.text },
        ],
      };

    case "verification":
      return {
        ...state,
        feed: [
          ...state.feed,
          { kind: "verification", id: action.id, ok: action.ok, issues: action.issues },
        ],
      };

    case "report_pending":
      return { ...state, composingReport: true };

    case "report":
      return {
        ...state,
        report: action.report,
        composingReport: false,
        feed: [
          ...state.feed,
          { kind: "insight", id: action.id, report: action.report },
        ],
      };

    case "step":
      return { ...state, step: { current: action.current, max: action.max } };

    case "usage":
      return {
        ...state,
        usage: {
          input: state.usage.input + action.inputTokens,
          output: state.usage.output + action.outputTokens,
        },
      };

    case "status":
      return {
        ...state,
        status: action.status,
        error: action.status === "error" ? action.message ?? "Something went wrong." : null,
      };

    default:
      return state;
  }
}

/** claude-sonnet-5 introductory pricing: $2 / $10 per million tokens. */
export function estimateCost(usage: { input: number; output: number }): number {
  return (usage.input / 1_000_000) * 2 + (usage.output / 1_000_000) * 10;
}
