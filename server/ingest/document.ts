// Document ingestion (v3 §14.1) — extract normalized text + a section outline
// from a text-layer PDF, a DOCX, or a plain TXT file. The Document pillar's
// equivalent of server/ingest/index.ts (the tabular pandas path).
//
// Produces: normalized text, a heading outline with char-offset anchors (the
// citation targets), and page/word counts. OCR of scanned/image PDFs and
// table-in-PDF extraction are OUT of scope this phase (v3 §11) — a PDF with no
// text layer throws so the upload path can mark the version ERROR (fail-soft),
// never 500.

import mammoth from "mammoth";
import type { DocSection } from "@/lib/agent/context";

export type DocumentKind = "pdf" | "docx" | "txt";

export interface DocumentExtract {
  kind: DocumentKind;
  /** Normalized full text (LF newlines, trimmed, blank runs collapsed). */
  text: string;
  /** Heading outline; each anchor is a "c<charOffset>" token into `text`. */
  sections: DocSection[];
  pageCount: number;
  wordCount: number;
}

export class DocumentIngestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Detect a document file by extension (magic bytes as a secondary hint). */
export function detectDocumentKind(buf: Buffer, filename: string): DocumentKind | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "txt" || ext === "md" || ext === "text") return "txt";
  // %PDF- magic bytes.
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return "pdf";
  }
  return null;
}

/** Collapse CRLF, strip non-printable control chars, squeeze blank runs. */
function normalizeText(raw: string): string {
  let out = "";
  for (const ch of raw.replace(/\r\n?/g, "\n")) {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10) out += ch; // keep tab + newline
    else if (code === 0xa0) out += " "; // non-breaking space
    else if (code < 0x20 || code === 0x7f) continue; // drop other control chars
    else out += ch;
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HEADING_MAX_LEN = 90;
const MAX_SECTIONS = 150;

const NUMBERED = /^(\d+(?:\.\d+)*)[.)]?\s+\S/;
const KEYWORD = /^(section|article|clause|appendix|schedule|exhibit|part|annex|item)\b/i;
const ALLCAPS = /^[A-Z0-9][A-Z0-9 \-&/,'()]{2,}$/;

/** Heuristic: is this trimmed line a heading? (no NLP, no deps.) */
function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 2 || t.length > HEADING_MAX_LEN) return false;
  // Numbered sections ("1.", "2.3 Scope", "Section 4") — the strongest signal.
  if (NUMBERED.test(t) && !/[.:;]$/.test(t)) return true;
  if (KEYWORD.test(t)) return true;
  // ALL-CAPS short lines ("PAYMENT TERMS", "SERVICE LEVEL AGREEMENT").
  if (ALLCAPS.test(t) && t.split(/\s+/).length <= 12) return true;
  // Title-case-ish short line with no terminal punctuation.
  if (
    !/[.,;:]$/.test(t) &&
    t.split(/\s+/).length <= 10 &&
    /^[A-Z]/.test(t) &&
    /^[A-Za-z0-9 \-&/,'()]+$/.test(t)
  ) {
    return true;
  }
  return false;
}

/** Build the heading outline over normalized text; anchors are char offsets. */
export function extractSections(text: string): DocSection[] {
  const sections: DocSection[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    if (sections.length >= MAX_SECTIONS) break;
    if (looksLikeHeading(line)) {
      sections.push({ heading: line.trim().slice(0, HEADING_MAX_LEN), anchor: `c${offset}` });
    }
    offset += line.length + 1; // +1 for the stripped "\n"
  }
  return sections;
}

function countWords(text: string): number {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

/** Nearest preceding section heading for a char offset (label for a citation). */
export function sectionForOffset(sections: DocSection[], offset: number): string | undefined {
  let best: DocSection | undefined;
  for (const s of sections) {
    const at = Number(s.anchor.replace(/^c/, ""));
    if (Number.isFinite(at) && at <= offset) best = s;
    else if (at > offset) break;
  }
  return best?.heading;
}

async function extractPdf(buf: Buffer): Promise<{ text: string; pageCount: number }> {
  // Dynamic import: unpdf bundles a serverless pdfjs build that needs no
  // DOMMatrix/canvas globals, and loading it lazily keeps the module graph
  // clean for TXT/DOCX uploads (which must never pull in pdfjs).
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text, pageCount: totalPages || 1 };
}

/**
 * Extract text + outline + counts from a document buffer. Throws
 * DocumentIngestError on an unsupported/empty/undecodable file (the caller
 * turns that into a fail-soft ERROR version, never a 500).
 */
export async function extractDocument(buf: Buffer, filename: string): Promise<DocumentExtract> {
  const kind = detectDocumentKind(buf, filename);
  if (!kind) {
    throw new DocumentIngestError("Unsupported document type. Upload a PDF, DOCX, or TXT file.");
  }

  let rawText = "";
  let pageCount = 1;

  try {
    if (kind === "pdf") {
      const out = await extractPdf(buf);
      rawText = out.text;
      pageCount = out.pageCount;
    } else if (kind === "docx") {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      rawText = value ?? "";
    } else {
      rawText = buf.toString("utf8");
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : "could not read the file";
    throw new DocumentIngestError(`Failed to read this ${kind.toUpperCase()} document: ${detail}`);
  }

  const text = normalizeText(rawText);
  if (!text || text.length < 20) {
    throw new DocumentIngestError(
      kind === "pdf"
        ? "No extractable text found — this PDF may be scanned/image-only. OCR isn't supported yet; upload a text-layer PDF, DOCX, or TXT."
        : "This document appears to be empty or has no extractable text.",
    );
  }

  const wordCount = countWords(text);
  if (kind !== "pdf") pageCount = Math.max(1, Math.ceil(wordCount / 500));

  return { kind, text, sections: extractSections(text), pageCount, wordCount };
}
