"use client";

// Collapsible "Source document" panel for a DOCUMENT-backed conversation.
// Fetches the pinned version's extracted text (GET …/sources/[sid]/text) and
// renders it split by section anchors, so a `cite` card can scroll here and
// briefly highlight the cited passage. Char-offset anchors are tokens like
// "c1234"; each section block is tagged with its anchor id for scroll targets.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocSection } from "@/lib/agent/context";
import { cn } from "@/lib/utils";
import { ChevronRight, FileText, Loader2 } from "lucide-react";

export interface CiteTarget {
  anchor: string;
  quote?: string;
  section?: string;
  nonce: number;
}

interface Block {
  anchor: string; // section anchor (scroll id); "" for the preamble block
  heading: string | null;
  offset: number;
  text: string;
}

/** "c1234" → 1234; tolerant of stray non-digits. NaN when unparseable. */
function anchorOffset(anchor: string): number {
  const m = /(\d+)/.exec(anchor);
  return m ? Number(m[1]) : NaN;
}

function buildBlocks(text: string, sections: DocSection[]): Block[] {
  const marks = sections
    .map((s) => ({ anchor: s.anchor, heading: s.heading, offset: anchorOffset(s.anchor) }))
    .filter((s) => Number.isFinite(s.offset) && s.offset >= 0 && s.offset <= text.length)
    .sort((a, b) => a.offset - b.offset);

  if (marks.length === 0) {
    return [{ anchor: "", heading: null, offset: 0, text }];
  }

  const blocks: Block[] = [];
  // Preamble before the first section heading.
  if (marks[0].offset > 0) {
    blocks.push({ anchor: "", heading: null, offset: 0, text: text.slice(0, marks[0].offset) });
  }
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].offset;
    const end = i + 1 < marks.length ? marks[i + 1].offset : text.length;
    blocks.push({
      anchor: marks[i].anchor,
      heading: marks[i].heading,
      offset: start,
      text: text.slice(start, end),
    });
  }
  return blocks;
}

/** The block whose range contains the target offset (last block starting ≤ offset). */
function blockForOffset(blocks: Block[], offset: number): Block | null {
  if (!Number.isFinite(offset)) return null;
  let hit: Block | null = null;
  for (const b of blocks) {
    if (b.offset <= offset) hit = b;
    else break;
  }
  return hit ?? blocks[0] ?? null;
}

function BlockBody({ text, quote, highlight }: { text: string; quote?: string; highlight: boolean }) {
  if (!highlight || !quote) return <>{text}</>;
  const needle = quote.trim();
  if (!needle) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber/30 text-foreground">{text.slice(idx, idx + needle.length)}</mark>
      {text.slice(idx + needle.length)}
    </>
  );
}

export function SourceDocumentPanel({
  orgId,
  sourceId,
  version,
  name,
  open,
  onToggle,
  cite,
}: {
  orgId: string;
  sourceId: string;
  version?: number;
  name: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  cite: CiteTarget | null;
}) {
  const [text, setText] = useState<string | null>(null);
  const [sections, setSections] = useState<DocSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const [activeQuote, setActiveQuote] = useState<string | undefined>(undefined);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazy-load the text the first time the panel opens.
  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    const q = typeof version === "number" ? `?version=${version}` : "";
    fetch(`/api/orgs/${orgId}/sources/${sourceId}/text${q}`)
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "Could not load the document.");
        setText(typeof j.text === "string" ? j.text : "");
        setSections(Array.isArray(j.sections) ? j.sections : []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load the document."))
      .finally(() => setLoading(false));
  }, [open, orgId, sourceId, version]);

  const blocks = useMemo(() => (text === null ? [] : buildBlocks(text, sections)), [text, sections]);

  const scrollToAnchor = useCallback(
    (anchor: string, quote?: string) => {
      const targetOffset = anchorOffset(anchor);
      const block = blockForOffset(blocks, targetOffset);
      const id = block?.anchor ?? anchor;
      setActiveAnchor(block?.anchor ?? null);
      setActiveQuote(quote);
      // Defer to next frame so freshly-opened content is in the DOM.
      requestAnimationFrame(() => {
        const container = scrollRef.current;
        const el = id ? container?.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(id)}"]`) : null;
        if (container && el) {
          const cRect = container.getBoundingClientRect();
          const eRect = el.getBoundingClientRect();
          container.scrollTop += eRect.top - cRect.top - 20;
        } else if (container && !block?.anchor) {
          container.scrollTop = 0;
        }
      });
      if (clearRef.current) clearTimeout(clearRef.current);
      clearRef.current = setTimeout(() => {
        setActiveAnchor(null);
        setActiveQuote(undefined);
      }, 2400);
    },
    [blocks],
  );

  // React to a citation click (nonce changes on every click, even same anchor).
  const lastNonce = useRef<number>(-1);
  useEffect(() => {
    if (!cite || cite.nonce === lastNonce.current) return;
    if (text === null) return; // wait until the doc is loaded, then re-run
    lastNonce.current = cite.nonce;
    scrollToAnchor(cite.anchor, cite.quote);
  }, [cite, text, scrollToAnchor]);

  useEffect(() => {
    return () => {
      if (clearRef.current) clearTimeout(clearRef.current);
    };
  }, []);

  return (
    <div className="rounded-xl border border-border bg-panel/60">
      <button
        onClick={() => onToggle(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-muted hover:text-foreground"
      >
        <ChevronRight size={14} className={cn("shrink-0 transition-transform", open && "rotate-90")} />
        <FileText size={14} className="shrink-0" />
        <span>Source document</span>
        <span className="truncate text-foreground/70">— {name}</span>
        {typeof version === "number" && <span className="text-muted">v{version}</span>}
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted/80">
          click a citation to jump here
        </span>
      </button>

      {open && (
        <div className="border-t border-border">
          {loading && (
            <div className="flex items-center gap-2 px-4 py-6 text-xs text-muted">
              <Loader2 size={14} className="animate-spin" />
              Loading document…
            </div>
          )}
          {error && !loading && (
            <div className="px-4 py-4 text-xs text-amber">{error}</div>
          )}
          {!loading && !error && text !== null && (
            <div
              ref={scrollRef}
              className="max-h-[26rem] overflow-y-auto px-4 py-3 text-[13px] leading-relaxed text-foreground/85"
            >
              {blocks.map((b, i) => {
                const isActive = activeAnchor !== null && b.anchor === activeAnchor;
                return (
                  <section
                    key={b.anchor || `pre-${i}`}
                    data-anchor={b.anchor || undefined}
                    className={cn(
                      "-mx-2 rounded-lg px-2 py-1 transition-colors duration-500",
                      isActive && "bg-accent/10 ring-1 ring-accent/40",
                    )}
                  >
                    {b.heading && (
                      <div className="mb-1 mt-2 font-mono text-[10px] uppercase tracking-wide text-accent/80">
                        {b.heading}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">
                      <BlockBody text={b.text} quote={isActive ? activeQuote : undefined} highlight={isActive} />
                    </p>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
