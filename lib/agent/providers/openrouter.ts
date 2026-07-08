// OpenRouter provider.
//
// OpenRouter exposes an OpenAI-compatible endpoint, not the Anthropic Messages
// API. So this module translates in both directions and keeps the rest of the
// app (client orchestrator, feed, tools) exactly as-is:
//   1. our Anthropic-shaped history + tools  ->  OpenAI chat-completions request
//   2. the OpenAI SSE stream                  ->  our { text } + { done } frames,
//      where { done } carries an Anthropic-shaped final message.

import { AGENT_TOOLS } from "@/lib/agent/tools";
import { SYSTEM_PROMPT } from "@/lib/agent/systemPrompt";
import { REPORT_INSTRUCTION, extractReport } from "@/lib/agent/report";
import type { ContentBlock, FinalReport } from "@/lib/types";
import type { AgentRequest, FinalMessage, SseWrite } from "./shared";

const MODEL = "anthropic/claude-sonnet-5";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// --- Anthropic history -> OpenAI messages ---
interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

function toOpenAIMessages(messages: AgentRequest["messages"]): OAIMessage[] {
  const out: OAIMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  for (const m of messages) {
    if (m.role === "user") {
      if (typeof m.content === "string") {
        out.push({ role: "user", content: m.content });
      } else {
        // Our user turns during the loop are arrays of tool_result blocks.
        // OpenAI represents each as a separate `tool` message.
        for (const b of m.content) {
          if (b.type === "tool_result") {
            out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.content });
          } else if (b.type === "text") {
            out.push({ role: "user", content: b.text });
          }
        }
      }
    } else {
      // assistant
      if (typeof m.content === "string") {
        out.push({ role: "assistant", content: m.content });
      } else {
        const text = m.content
          .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
          .map((b) => b.text)
          .join("");
        const toolCalls = m.content
          .filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use")
          .map((b) => ({
            id: b.id,
            type: "function" as const,
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          }));
        const msg: OAIMessage = { role: "assistant", content: text || null };
        if (toolCalls.length) msg.tool_calls = toolCalls;
        out.push(msg);
      }
    }
  }
  return out;
}

// Some models format their tool-call JSON with raw newlines/tabs inside string
// values, which is invalid JSON and makes JSON.parse throw. Escape control
// characters ONLY when inside a string (structural whitespace is left alone),
// then parse. Returns null if it still can't be parsed.
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

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    /* some models emit raw newlines inside string values — repair and retry */
  }
  try {
    return JSON.parse(repairJsonStrings(s));
  } catch {
    return {};
  }
}

const OAI_TOOLS = AGENT_TOOLS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

export async function runOpenRouterTurn(
  write: SseWrite,
  body: AgentRequest,
  apiKey: string,
): Promise<void> {
  const reqBody = {
    model: MODEL,
    messages: toOpenAIMessages(body.messages),
    tools: OAI_TOOLS,
    tool_choice: "auto",
    // Disable reasoning: lower latency, and (usefully) makes the agent more
    // likely to hit and then visibly self-correct the messy-column error.
    reasoning: { effort: "none" },
    max_tokens: 8192,
    stream: true,
    stream_options: { include_usage: true },
  };

  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // Optional attribution shown on the OpenRouter dashboard.
      "HTTP-Referer": "https://github.com/glass-box",
      "X-Title": "Glass Box",
    },
    body: JSON.stringify(reqBody),
  });

  if (!resp.ok || !resp.body) {
    let detail = resp.statusText;
    try {
      const j = await resp.json();
      detail = j?.error?.message || j?.error || detail;
    } catch {
      /* keep statusText */
    }
    write("error", { message: `OpenRouter error: ${detail}`, status: resp.status });
    return;
  }

  // --- OpenAI SSE -> our frames ---
  let textAcc = "";
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();
  let finishReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleData = (data: string) => {
    if (data === "[DONE]") return;
    let chunk: {
      choices?: {
        delta?: {
          content?: string | null;
          tool_calls?: {
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
        finish_reason?: string | null;
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }

    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
      outputTokens = chunk.usage.completion_tokens ?? outputTokens;
    }

    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta;

    if (delta?.content) {
      textAcc += delta.content;
      write("text", { delta: delta.content });
    }
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const entry = toolAcc.get(tc.index) ?? { id: "", name: "", args: "" };
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name += tc.function.name;
        if (tc.function?.arguments) entry.args += tc.function.arguments;
        toolAcc.set(tc.index, entry);
      }
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) handleData(trimmed.slice(5).trim());
    }
  }
  if (buffer.trim().startsWith("data:")) handleData(buffer.trim().slice(5).trim());

  // --- Build the Anthropic-shaped final message the client understands ---
  const content: ContentBlock[] = [];
  if (textAcc) content.push({ type: "text", text: textAcc });
  for (const [, t] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
    const input = t.args ? safeJsonParse(t.args) : {};
    content.push({
      type: "tool_use",
      id: t.id || `call_${t.name}_${content.length}`,
      name: t.name,
      input,
    });
  }

  const stop_reason =
    finishReason === "tool_calls"
      ? "tool_use"
      : finishReason === "length"
        ? "max_tokens"
        : "end_turn";

  const final: FinalMessage = {
    content,
    stop_reason,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
  write("done", final);
}

/**
 * Dedicated, non-streaming report generation. Sends the whole analysis history
 * plus a strict "return JSON" instruction, then robustly extracts a report that
 * is never empty. This is far more reliable than trusting streamed tool args.
 */
export async function generateOpenRouterReport(
  messages: AgentRequest["messages"],
  apiKey: string,
): Promise<FinalReport> {
  const oai = toOpenAIMessages(messages);
  oai.push({ role: "user", content: REPORT_INSTRUCTION });

  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/glass-box",
      "X-Title": "Glass Box",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: oai,
      reasoning: { effort: "none" },
      max_tokens: 2500,
      stream: false,
    }),
  });

  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const j = await resp.json();
      detail = j?.error?.message || j?.error || detail;
    } catch {
      /* keep statusText */
    }
    throw new Error(`OpenRouter report error: ${detail}`);
  }

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content ?? "";
  return extractReport(String(content));
}
