// Document-intelligence layer (v3 §14.4) — the one-time Claude "domain read"
// for a DOCUMENT source. A single claude-sonnet-5 low-effort call that turns the
// extracted text + heading outline into a DocProfile (docType, description, key
// entities). Cached on SourceVersion.profile by the upload path; fail-soft →
// null so an upload is never blocked.
//
// Provider selection + env handling mirror server/agent/scopeGate.ts.

import Anthropic from "@anthropic-ai/sdk";
import type { DocProfile, DocSection } from "@/lib/agent/context";

const MODEL_ANTHROPIC = "claude-sonnet-5";
const MODEL_OPENROUTER = "anthropic/claude-sonnet-5";

type Provider = "anthropic" | "openrouter";

function chooseProvider(): { provider: Provider; apiKey: string } | null {
  const forced = process.env.AGENT_PROVIDER?.toLowerCase();
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const openrouter = process.env.OPENROUTER_API_KEY;
  if (forced === "anthropic" && anthropic) return { provider: "anthropic", apiKey: anthropic };
  if (forced === "openrouter" && openrouter) return { provider: "openrouter", apiKey: openrouter };
  if (anthropic) return { provider: "anthropic", apiKey: anthropic };
  if (openrouter) return { provider: "openrouter", apiKey: openrouter };
  return null;
}

const DOC_TYPES = new Set(["rfp", "requirements", "contract", "policy", "report", "other"]);

function buildPrompt(name: string, text: string, sections: DocSection[]): string {
  const outline = sections
    .slice(0, 40)
    .map((s) => `- ${s.heading}`)
    .join("\n");
  // A head + tail excerpt keeps the profiling call cheap on long documents.
  const head = text.slice(0, 6000);
  const tail = text.length > 9000 ? `\n…\n${text.slice(-3000)}` : "";
  return `You are profiling a business document for a document-analysis companion. Read the outline and an excerpt, then describe what this document IS.

Document name: "${name}"

Section outline:
${outline || "(no clear headings detected)"}

Excerpt:
${head}${tail}

Respond with ONLY a JSON object, no other text:
{
  "docType": "rfp" | "requirements" | "contract" | "policy" | "report" | "other",
  "description": "1-2 sentences: what this document is and its purpose",
  "keyEntities": ["the parties, key dates, dollar amounts, obligations, or deadlines that matter — up to 8"]
}
Pick the single best docType. Use [] if you cannot fill keyEntities.`;
}

function parseProfileFields(
  text: string,
): { docType: DocProfile["docType"]; description: string; keyEntities: string[] } | null {
  try {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    const j = JSON.parse(text.slice(first, last + 1)) as Record<string, unknown>;
    const docType = (
      typeof j.docType === "string" && DOC_TYPES.has(j.docType) ? j.docType : "other"
    ) as DocProfile["docType"];
    const description = typeof j.description === "string" ? j.description.trim() : "";
    const keyEntities = Array.isArray(j.keyEntities)
      ? j.keyEntities.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 8)
      : [];
    if (!description && keyEntities.length === 0) return null;
    return { docType, description, keyEntities };
  } catch {
    return null;
  }
}

/**
 * One cheap Claude call that returns the document's DocProfile, or null on any
 * error (missing key, network, bad JSON). The deterministic `sections`,
 * `pageCount`, and `wordCount` are carried through from ingestion; the model
 * only supplies docType / description / keyEntities.
 */
export async function describeDocument(
  name: string,
  text: string,
  sections: DocSection[],
  pageCount: number,
  wordCount: number,
): Promise<DocProfile | null> {
  const sel = chooseProvider();
  if (!sel) return null;
  const prompt = buildPrompt(name, text, sections);
  try {
    let out = "";
    if (sel.provider === "anthropic") {
      const client = new Anthropic({ apiKey: sel.apiKey });
      const resp = await client.messages.create({
        model: MODEL_ANTHROPIC,
        max_tokens: 600,
        output_config: { effort: "low" },
        messages: [{ role: "user", content: prompt }],
      });
      out = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    } else {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${sel.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL_OPENROUTER,
          messages: [{ role: "user", content: prompt }],
          reasoning: { effort: "low" },
          max_tokens: 600,
        }),
      });
      if (!resp.ok) return null;
      const j = await resp.json();
      out = String(j?.choices?.[0]?.message?.content ?? "");
    }
    const fields = parseProfileFields(out);
    if (!fields) return null;
    return {
      kind: "document",
      docType: fields.docType,
      description: fields.description,
      sections,
      keyEntities: fields.keyEntities,
      pageCount,
      wordCount,
    };
  } catch {
    return null;
  }
}

/** Deterministic DocProfile used when the Claude domain read is unavailable. */
export function fallbackDocProfile(
  sections: DocSection[],
  pageCount: number,
  wordCount: number,
): DocProfile {
  return {
    kind: "document",
    docType: "other",
    description: "",
    sections,
    keyEntities: [],
    pageCount,
    wordCount,
  };
}
