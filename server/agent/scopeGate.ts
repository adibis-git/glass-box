// Scope gate — a cheap, deterministic classifier that runs BEFORE the agent
// loop. Decides whether a question can plausibly be answered from the loaded
// datasets; out-of-scope questions are refused without spending a kernel or a
// full agent run. Fails OPEN (in-scope) on classifier errors so legitimate
// analysis is never blocked by gate flakiness.

import Anthropic from "@anthropic-ai/sdk";

const MODEL_ANTHROPIC = "claude-sonnet-5";
const MODEL_OPENROUTER = "anthropic/claude-sonnet-5";

export interface ScopeVerdict {
  inScope: boolean;
  /** User-facing refusal message when out of scope. */
  refusal?: string;
}

function buildPrompt(
  question: string,
  datasets: { alias: string; name: string; columns: string[] }[],
): string {
  const desc = datasets
    .map((d) => `- ${d.alias} ("${d.name}"): columns [${d.columns.join(", ")}]`)
    .join("\n");
  return `You are a scope classifier for a data-analysis companion used by business decision makers. The tool analyzes the following loaded datasets with pandas and turns them into insights and data-grounded recommendations:

${desc}

Question: "${question}"

Decide whether this question can be MEANINGFULLY INFORMED by analyzing these datasets.

IN scope (answer {"in_scope": true}):
- Direct analytical questions: metrics, trends, comparisons, rates, rankings, outliers, data quality.
- Follow-ups referring to earlier analysis of this data ("what about by region?", "which one first?").
- DECISION-SUPPORT questions about the business/domain this data describes — "what should I do / decide / prioritize / fix / focus on / improve?", "where are we losing money?", "what would you recommend as a manager?". These are the tool's core purpose: the agent answers them with recommendations grounded strictly in what the data shows. Lean in-scope whenever the data could inform the decision, even partially.

OUT of scope (answer {"in_scope": false}):
- Questions requiring knowledge the data cannot provide AT ALL: world events, sports outcomes, celebrity/politics, market predictions, general coding help, other companies' private data, math homework, or anything with no connection to this business's data.

Respond with ONLY a JSON object, no other text:
{"in_scope": true}
or
{"in_scope": false, "refusal": "one or two friendly sentences declining and steering back to what you CAN analyze in this data"}`;
}

function parseVerdict(text: string): ScopeVerdict | null {
  try {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    const j = JSON.parse(text.slice(first, last + 1)) as {
      in_scope?: boolean;
      refusal?: string;
    };
    if (typeof j.in_scope !== "boolean") return null;
    return {
      inScope: j.in_scope,
      refusal:
        typeof j.refusal === "string" && j.refusal.trim()
          ? j.refusal.trim()
          : "I can only analyze the data loaded in this conversation — ask me anything about those datasets instead.",
    };
  } catch {
    return null;
  }
}

export async function classifyScope(
  question: string,
  datasets: { alias: string; name: string; columns: string[] }[],
  provider: "anthropic" | "openrouter",
  apiKey: string,
): Promise<ScopeVerdict> {
  const prompt = buildPrompt(question, datasets);
  try {
    let text = "";
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      const resp = await client.messages.create({
        model: MODEL_ANTHROPIC,
        max_tokens: 200,
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: prompt }],
      });
      text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    } else {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL_OPENROUTER,
          messages: [{ role: "user", content: prompt }],
          reasoning: { effort: "none" },
          max_tokens: 200,
        }),
      });
      if (!resp.ok) return { inScope: true }; // fail open
      const j = await resp.json();
      text = String(j?.choices?.[0]?.message?.content ?? "");
    }
    return parseVerdict(text) ?? { inScope: true };
  } catch {
    return { inScope: true }; // fail open
  }
}
