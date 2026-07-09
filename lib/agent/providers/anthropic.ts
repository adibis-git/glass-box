// Anthropic-direct provider: one Claude turn via the native Messages API.
// The final message it emits is already in the shape the client expects.

import Anthropic from "@anthropic-ai/sdk";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { REPORT_TOOL, REPORT_INSTRUCTION, normalizeReport } from "@/lib/agent/report";
import type { FinalReport } from "@/lib/types";
import type { AgentRequest, SseWrite } from "./shared";

const MODEL = "claude-sonnet-5";

type Effort = "low" | "medium" | "high";

export async function runAnthropicTurn(
  write: SseWrite,
  body: AgentRequest,
  apiKey: string,
  system: string,
  effort: Effort,
): Promise<void> {
  const client = new Anthropic({ apiKey });

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    // Adaptive thinking is on by default on claude-sonnet-5; the effort dial
    // (user-selectable, defaults to LOW) scales how much it reasons.
    output_config: { effort },
    system,
    tools: AGENT_TOOLS as Anthropic.Tool[],
    tool_choice: { type: "auto" },
    messages: body.messages as Anthropic.MessageParam[],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      write("text", { delta: event.delta.text });
    }
  }

  const final = await stream.finalMessage();
  write("done", final);
}

/** Dedicated, non-streaming report generation via a forced final_report tool. */
export async function generateAnthropicReport(
  messages: AgentRequest["messages"],
  apiKey: string,
  system: string,
  effort: Effort,
): Promise<FinalReport> {
  const client = new Anthropic({ apiKey });

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2500,
    output_config: { effort },
    system,
    tools: [REPORT_TOOL] as Anthropic.Tool[],
    tool_choice: { type: "tool", name: "final_report" },
    messages: [
      ...(messages as Anthropic.MessageParam[]),
      { role: "user", content: REPORT_INSTRUCTION },
    ],
  });

  const block = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "final_report",
  );
  return normalizeReport((block?.input ?? {}) as Record<string, unknown>);
}
