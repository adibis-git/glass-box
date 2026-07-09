// Tool definitions for the document engine (v3 §14.3), in Anthropic Messages
// API shape. These are the document pillar's "glass box": retrieval surfaces the
// evidence, `cite` records it verbatim, `extract` compiles structured lists.
// The engine concludes with the shared final_report tool.

import { REPORT_TOOL } from "@/lib/agent/report";

export interface SearchDocumentInput {
  query: string;
  doc?: string;
}

export interface CiteInput {
  anchor: string;
  quote: string;
}

export interface ExtractInput {
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

export const SEARCH_DOCUMENT_TOOL = {
  name: "search_document",
  description:
    "Search the loaded document(s) for passages relevant to a query. ALWAYS call this BEFORE answering any question about document content — never answer from memory. It returns the most relevant passages, each prefixed with an [anchor: …] token and its section heading. Call it several times with different phrasings to gather ALL relevant evidence (e.g. for 'every requirement', search 'must', 'shall', 'required', 'mandatory').",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "What to look for — keywords or a short phrase (e.g. 'payment terms', 'SLA uptime', 'mandatory requirements').",
      },
      doc: {
        type: "string",
        description: "Optional: restrict the search to one document by its handle/alias (when multiple are loaded).",
      },
    },
    required: ["query"],
  },
};

export const CITE_TOOL = {
  name: "cite",
  description:
    "Record a piece of evidence that grounds a claim. Pass the EXACT [anchor] token from a search result and a VERBATIM quote (a substring copied from that passage — do not paraphrase). Cite every material claim, requirement, obligation, number, or term you rely on — citations are how the user verifies your answer against the source.",
  input_schema: {
    type: "object" as const,
    properties: {
      anchor: {
        type: "string",
        description: "The exact anchor token from a search result, e.g. 'c1840'.",
      },
      quote: {
        type: "string",
        description: "The exact text from the passage that supports your claim (copied verbatim).",
      },
    },
    required: ["anchor", "quote"],
  },
};

export const EXTRACT_TOOL = {
  name: "extract",
  description:
    "Compile a structured list pulled from the document — e.g. every requirement, obligation, deadline, SLA, or price. Use this for 'extract every X' or 'list all Y' requests. Provide a title, the column names, and one object per row. Ground each row in the text you searched; cite the important ones with `cite`.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "What the list is, e.g. 'Mandatory requirements'." },
      columns: {
        type: "array",
        items: { type: "string" },
        description: "Column names, e.g. ['#', 'Requirement', 'Type', 'Section'].",
      },
      rows: {
        type: "array",
        items: { type: "object", additionalProperties: true },
        description: "One object per row, keyed by the column names.",
      },
    },
    required: ["title", "columns", "rows"],
  },
};

/** Tool set the document engine streams with (report tool included). */
export const DOCUMENT_TOOLS = [SEARCH_DOCUMENT_TOOL, CITE_TOOL, EXTRACT_TOOL, REPORT_TOOL];
