import type { ChatMessage } from "@/lib/types";

export interface AgentRequest {
  messages: ChatMessage[];
  /**
   * "turn" (default) streams one analysis turn as SSE. "report" runs a dedicated
   * non-streaming call that returns the final report as JSON.
   */
  mode?: "turn" | "report";
}

/** Writes one SSE frame to the response stream. */
export type SseWrite = (event: string, data: unknown) => void;

/**
 * The final-message shape the client orchestrator expects, regardless of
 * provider. It mirrors the Anthropic Messages API response: content blocks
 * (text + tool_use), a stop_reason, and token usage.
 */
export interface FinalMessage {
  content: unknown[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}
