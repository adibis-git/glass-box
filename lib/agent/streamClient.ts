// Thin client for the server-side agent loop: POST a question, parse the SSE
// AgentEvent stream, dispatch each event into the feed reducer.

import type { AgentEvent } from "@/lib/agent/events";

const EVENT_TYPES = new Set([
  "plan_start", "plan_delta", "plan_end", "correction", "code", "execution",
  "chart", "report_pending", "report", "step", "usage", "status",
]);

export interface StreamHandlers {
  onEvent: (e: AgentEvent) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

export async function streamQuestion(
  orgId: string,
  conversationId: string,
  question: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
  effort?: string,
): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch(`/api/orgs/${orgId}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(effort ? { question, effort } : { question }),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    handlers.onError("Network error — check your connection and retry.");
    return;
  }

  if (!resp.ok || !resp.body) {
    let msg = `Request failed (${resp.status})`;
    try {
      const j = await resp.json();
      if (j?.error) msg = j.error;
    } catch {
      /* keep default */
    }
    handlers.onError(msg);
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleFrame = (frame: string) => {
    const lines = frame.split("\n");
    let event = "";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!event || !data) return;
    if (EVENT_TYPES.has(event)) {
      try {
        handlers.onEvent(JSON.parse(data) as AgentEvent);
      } catch {
        /* skip malformed frame */
      }
    }
    // "meta" / "persisted" frames are informational.
  };

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (frame.trim() && !frame.startsWith(":")) handleFrame(frame);
      }
    }
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "AbortError")) {
      handlers.onError("The stream was interrupted. Reload to see the persisted result.");
      return;
    }
  }
  handlers.onDone();
}
