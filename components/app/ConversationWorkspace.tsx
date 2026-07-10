"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { feedReducer, initialFeedState, type FeedState } from "@/lib/feed";
import { fmtInt } from "@/lib/utils";
import { streamQuestion } from "@/lib/agent/streamClient";
import type { AgentEvent, Suggestion } from "@/lib/agent/events";
import { FeedCard } from "@/components/FeedCard";
import { ReportPanel, ReportComposing } from "@/components/ReportPanel";
import { ChartRenderer } from "@/components/ChartRenderer";
import { Button } from "@/components/ui/Button";
import { CitationProvider, type ScrollToCitation } from "@/components/app/SourceDocContext";
import { SourceDocumentPanel, type CiteTarget } from "@/components/app/SourceDocumentPanel";
import { Markdown } from "@/components/Markdown";
import type { AnalysisEffort } from "@/lib/generated/prisma/enums";
import {
  Sparkles,
  CircleUserRound,
  Wrench,
  ChevronRight,
  Loader2,
  Ban,
  ScanSearch,
  ArrowUpCircle,
  Check,
  Share2,
  Send,
  FileText,
} from "lucide-react";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

const EFFORT_OPTIONS: { value: AnalysisEffort; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

/**
 * A suggestion as it may arrive from the server / persisted JSON: either the new
 * `{ label, question }` object or a bare legacy string.
 */
type RawSuggestion = string | Suggestion;

/** Coerce a suggestion to `{ label, question }`, treating a string as both. */
function normalizeSuggestion(x: RawSuggestion): Suggestion {
  if (typeof x === "string") return { label: x, question: x };
  return { label: x.label || x.question, question: x.question };
}

interface MessageProp {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string | null;
  events: AgentEvent[] | null;
  status: string;
  error: string | null;
  suggestions: RawSuggestion[] | null;
}

interface ConversationProp {
  id: string;
  title: string;
  defaultEffort: AnalysisEffort;
  starterQuestions: RawSuggestion[];
  datasets: { alias: string; name: string; sampled: boolean; rowCount: number | null; version?: number }[];
  messages: MessageProp[];
}

function SuggestionChips({ items, onPick }: { items: RawSuggestion[]; onPick: (q: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5 pl-9">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        <Sparkles size={12} className="text-muted" />
        Suggested
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((raw, i) => {
          const s = normalizeSuggestion(raw);
          return (
            <button
              key={`${s.label}-${i}`}
              onClick={() => onPick(s.question)}
              title={s.question}
              className="rounded-full border border-border bg-panel/60 px-3 py-1.5 text-xs text-foreground/80 transition hover:border-accent/50 hover:text-foreground"
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function replay(events: AgentEvent[]): FeedState {
  let s = { ...initialFeedState };
  for (const e of events) s = feedReducer(s, e);
  // Replay never leaves a dangling streaming cursor.
  s = { ...s, feed: s.feed.map((f) => (f.kind === "plan" ? { ...f, streaming: false } : f)) };
  return s;
}

function ShareButton({ orgId, messageId }: { orgId: string; messageId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [link, setLink] = useState<string | null>(null);

  async function share() {
    setState("busy");
    const res = await fetch(`/api/orgs/${orgId}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, share: true }),
    });
    const j = await res.json().catch(() => ({}));
    setState("done");
    if (res.ok && j.snapshot?.sharePath) {
      const url = `${location.origin}${j.snapshot.sharePath}`;
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* clipboard optional */
      }
    }
  }

  if (link)
    return (
      <a href={link} target="_blank" className="inline-flex items-center gap-1.5 text-xs text-green hover:underline">
        <Check size={13} className="text-green" />
        Link copied — open shared report
      </a>
    );
  return (
    <button
      onClick={share}
      disabled={state === "busy"}
      className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent"
    >
      {state === "busy" ? (
        <>
          <Loader2 size={13} className="animate-spin" />
          Creating link…
        </>
      ) : (
        <>
          <Share2 size={13} />
          Share this report
        </>
      )}
    </button>
  );
}

function RunBlock({
  question,
  events,
  live,
  error,
  orgId,
  messageId,
  canShare,
  suggestions,
  onAsk,
}: {
  question: string;
  events: AgentEvent[];
  live: boolean;
  error?: string | null;
  orgId: string;
  messageId?: string | null;
  canShare: boolean;
  suggestions?: RawSuggestion[] | null;
  onAsk?: (q: string) => void;
}) {
  const state = useMemo(() => replay(events), [events]);
  const steps = state.feed.filter((f) => f.kind === "code").length;
  const corrections = state.feed.filter((f) => f.kind === "correction").length;

  // Conversational answer: when the turn produced NO report, the model's final
  // text IS the answer — surface it as a prominent reply bubble instead of
  // burying it inside the collapsed trace. (When a report exists, the report
  // card is the headline, so we don't promote a plan block.) The promoted item
  // is removed from the trace so it isn't shown twice.
  const planItems = state.feed.filter(
    (f): f is Extract<typeof f, { kind: "plan" }> => f.kind === "plan" && f.text.trim() !== "",
  );
  const answerItem = !state.report && planItems.length > 0 ? planItems[planItems.length - 1] : null;
  const traceFeed = answerItem ? state.feed.filter((f) => f.id !== answerItem.id) : state.feed;

  return (
    <div className="space-y-4">
      {/* Question */}
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-panel-2 text-muted">
          <CircleUserRound size={16} />
        </span>
        <div className="rounded-xl rounded-tl-sm border border-border bg-panel px-4 py-2.5 text-sm text-foreground/90">
          {question}
        </div>
      </div>

      {/* Live progress line */}
      {live && state.status === "running" && (
        <div className="flex items-center gap-2 pl-9 text-xs text-muted">
          <Loader2 size={14} className="animate-spin text-accent" />
          {state.step ? `Analyzing — step ${state.step.current} of ${state.step.max}` : "Starting…"}
          {corrections > 0 && (
            <span className="text-amber">· self-corrected {corrections}×</span>
          )}
        </div>
      )}

      {/* Results: report + charts (business view) */}
      <div className="space-y-4 pl-9">
        {state.notice && (
          <div className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Ban size={16} className="mt-0.5 shrink-0 text-amber" />
              <p className="text-sm leading-relaxed text-amber">{state.notice.text}</p>
            </div>
          </div>
        )}
        {state.composingReport && <ReportComposing />}
        {state.report && (
          <div className="space-y-1.5">
            <ReportPanel report={state.report} />
            {canShare && !live && messageId && (
              <div className="flex justify-end px-1">
                <ShareButton orgId={orgId} messageId={messageId} />
              </div>
            )}
          </div>
        )}
        {/* Primary conversational answer (non-report turns) */}
        {answerItem && (
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/15 text-accent">
              <Sparkles size={15} />
            </span>
            <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-accent/30 bg-accent/5 px-4 py-3">
              <Markdown text={answerItem.text} className="text-foreground/95" />
              {answerItem.streaming && (
                <Loader2 size={14} className="mt-1 animate-spin text-accent" />
              )}
            </div>
          </div>
        )}
        {state.charts.length > 0 && (
          <div className="grid gap-4">
            {state.charts.map((c) => (
              <ChartRenderer key={c.id} spec={c.spec} />
            ))}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red/40 bg-red/10 p-4 text-sm text-red">
            {error}
          </div>
        )}
        {state.status === "error" && state.error && !error && (
          <div className="rounded-xl border border-red/40 bg-red/10 p-4 text-sm text-red">
            {state.error}
          </div>
        )}

        {/* Collapsible agent trace — the glass box. Shows the WORK behind the
            answer (plan · code · output · fixes). Report turns open EXPANDED so
            the decision's reasoning reads at a glance; quick-answer turns stay
            collapsed (answer-first). Live runs are always open. */}
        {traceFeed.length > 0 && (
          <details
            className="group rounded-xl border border-border/70 bg-panel/40 open:bg-panel/60"
            open={live || Boolean(state.report)}
          >
            <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-foreground">
              <ChevronRight size={13} className="shrink-0 transition-transform group-open:rotate-90" />
              <Wrench size={13} className="shrink-0" />
              <span>{answerItem || state.report ? "Show the work" : "Agent trace"}</span>
              {steps > 0 && <span className="text-muted/80">· {steps} step{steps === 1 ? "" : "s"}</span>}
              {corrections > 0 && (
                <span className="text-amber">· {corrections} self-correction{corrections === 1 ? "" : "s"}</span>
              )}
              <span className="ml-1 text-[10px] uppercase tracking-wide text-muted/70">
                plan · code · output · fixes
              </span>
            </summary>
            <div className="space-y-3 border-t border-border p-3">
              {traceFeed.map((item) => (
                <FeedCard key={item.id} item={item} />
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Follow-up suggestion chips for this assistant turn */}
      {!live && onAsk && suggestions && suggestions.length > 0 && (
        <SuggestionChips items={suggestions} onPick={onAsk} />
      )}
    </div>
  );
}

interface DocSummary {
  sourceId: string;
  version: number;
  name: string;
  docType: string;
  description: string;
  pageCount: number;
  wordCount: number;
  sectionCount: number;
}

/** A pinned source that has a newer live version available to adopt (v3 §15.1). */
export interface SourceUpdate {
  sourceId: string;
  name: string;
  pinnedVersion: number;
  latestVersion: number;
}

export function ConversationWorkspace({
  orgId,
  myRole,
  conversation,
  personaLabel,
  domain,
  documents,
  sourceUpdates,
}: {
  orgId: string;
  myRole: Role;
  conversation: ConversationProp;
  personaLabel?: string | null;
  domain?: string | null;
  documents?: DocSummary[];
  sourceUpdates?: SourceUpdate[];
}) {
  const router = useRouter();
  const canAsk = myRole !== "VIEWER";

  // The primary document backing this conversation (if any) powers the
  // click-to-scroll "Source document" panel and citation jumps.
  const primaryDoc = documents && documents.length > 0 ? documents[0] : null;
  const [docPanelOpen, setDocPanelOpen] = useState(false);
  const [citeTarget, setCiteTarget] = useState<CiteTarget | null>(null);
  const citeNonce = useRef(0);

  const scrollToCitation = useMemo<ScrollToCitation | null>(() => {
    if (!primaryDoc) return null;
    return (anchor, quote, section) => {
      setDocPanelOpen(true);
      citeNonce.current += 1;
      setCiteTarget({ anchor, quote, section, nonce: citeNonce.current });
    };
  }, [primaryDoc]);

  // Adopt a newer version of a pinned source into this conversation.
  const [adopting, setAdopting] = useState<string | null>(null);
  const [dismissedUpdates, setDismissedUpdates] = useState<Set<string>>(() => new Set());
  async function adopt(sourceId: string, version: number) {
    if (adopting) return;
    setAdopting(sourceId);
    try {
      const res = await fetch(`/api/orgs/${orgId}/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, version }),
      });
      if (res.ok) {
        setDismissedUpdates((prev) => new Set(prev).add(sourceId));
        router.refresh();
      }
    } finally {
      setAdopting(null);
    }
  }
  const pendingUpdates = (sourceUpdates ?? []).filter((u) => !dismissedUpdates.has(u.sourceId));

  // Persisted runs: pair USER question → following ASSISTANT events.
  const persistedRuns = useMemo(() => {
    const runs: {
      question: string;
      events: AgentEvent[];
      error: string | null;
      messageId: string | null;
      suggestions: RawSuggestion[];
    }[] = [];
    const msgs = conversation.messages;
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].role !== "USER") continue;
      const assistant = msgs.slice(i + 1).find((m) => m.role === "ASSISTANT");
      runs.push({
        question: msgs[i].content ?? "",
        events: assistant?.events ?? [],
        error: assistant?.status === "ERROR" ? assistant.error ?? "The run failed." : null,
        messageId: assistant?.id ?? null,
        suggestions: assistant?.suggestions ?? [],
      });
    }
    return runs;
  }, [conversation.messages]);

  const [liveQuestion, setLiveQuestion] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState("");
  const [effort, setEffort] = useState<AnalysisEffort>(conversation.defaultEffort ?? "LOW");
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [liveEvents.length, persistedRuns.length]);

  async function ask(q?: string) {
    const question = (q ?? input).trim();
    if (!question || running) return;
    setInput("");
    setLiveQuestion(question);
    setLiveEvents([]);
    setLiveError(null);
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    await streamQuestion(
      orgId,
      conversation.id,
      question,
      {
        onEvent: (e) => setLiveEvents((prev) => [...prev, e]),
        onError: (msg) => {
          setLiveError(msg);
          setRunning(false);
        },
        onDone: () => {
          setRunning(false);
          // Refresh server data so the run becomes a persisted block; clear live.
          router.refresh();
          setTimeout(() => {
            setLiveQuestion(null);
            setLiveEvents([]);
          }, 400);
        },
      },
      ctrl.signal,
      effort,
    );
  }

  const hasAnyRun = persistedRuns.length > 0 || liveQuestion !== null;
  // Prefer persona×data starter questions when present; else generic prompts.
  const suggested: RawSuggestion[] = conversation.starterQuestions.length
    ? conversation.starterQuestions
    : [
        "Explore this data and surface the most important insights",
        "What changed over time, and where is it concentrated?",
        "What should we act on first, based on this data?",
      ];

  return (
    <div className="flex h-full flex-col">
      {/* Header — compact, sticky at the top of the column */}
      <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto max-w-3xl">
          {/* Title row */}
          <div className="flex items-center justify-between gap-3">
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
              {conversation.title}
            </h1>
            {running && (
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-accent">
                <Loader2 size={13} className="animate-spin" />
                <span className="hidden sm:inline">analyzing</span>
              </span>
            )}
          </div>

          {/* Chips row — source badges + persona pill, wraps gracefully */}
          {(conversation.datasets.length > 0 || personaLabel || domain) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {conversation.datasets.map((d) => (
                <span
                  key={d.alias}
                  className="inline-flex h-6 max-w-full items-center gap-1 rounded-md border border-border bg-panel-2 px-2 font-mono text-[11px] leading-none text-foreground/80"
                  title={`${d.alias} = ${d.name}${d.version ? ` v${d.version}` : ""}${d.rowCount ? ` · ${fmtInt(d.rowCount)} rows` : ""}${d.sampled ? " · sample" : ""}`}
                >
                  <span className="text-muted">{d.alias}</span>
                  <span className="text-muted/50">=</span>
                  <span className="truncate text-foreground/85">{d.name}</span>
                  {d.version ? <span className="shrink-0 text-muted">v{d.version}</span> : null}
                  {d.sampled && <span className="shrink-0 text-amber">(sample)</span>}
                </span>
              ))}
              {personaLabel && (
                <span className="inline-flex h-6 items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 text-[11px] leading-none text-accent">
                  <Sparkles size={11} className="shrink-0" />
                  {personaLabel}
                </span>
              )}
              {domain && (
                <span
                  className="inline-flex h-6 max-w-[16rem] items-center rounded-md border border-border bg-panel-2/60 px-2 text-[11px] leading-none text-muted"
                  title={`Context: ${domain}`}
                >
                  <span className="truncate">Context: {domain}</span>
                </span>
              )}
            </div>
          )}

          {/* Document context — condensed, truncated single line per doc */}
          {documents && documents.length > 0 && (
            <div className="mt-2 space-y-1">
              {documents.map((d) => {
                const meta = `${d.pageCount} page${d.pageCount === 1 ? "" : "s"} · ${fmtInt(d.wordCount)} words · ${d.sectionCount} section${d.sectionCount === 1 ? "" : "s"}`;
                const full = `${d.name} · ${meta}${d.description ? ` — ${d.description}` : ""}`;
                return (
                  <div
                    key={d.name}
                    className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted"
                    title={full}
                  >
                    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-blue/30 bg-blue/10 px-1.5 py-0.5 uppercase tracking-wide text-blue">
                      <FileText size={10} className="shrink-0" />
                      {d.docType}
                    </span>
                    <span className="truncate">
                      <span className="text-foreground/80">{d.name}</span>
                      <span className="text-muted/80"> · {meta}</span>
                      {d.description && <span className="text-muted/70"> — {d.description}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* Runs */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <CitationProvider value={scrollToCitation}>
        <div className="mx-auto max-w-3xl space-y-8">
          {/* Newer-version banners: one per pinned source with a live update */}
          {pendingUpdates.length > 0 && (
            <div className="space-y-2">
              {pendingUpdates.map((u) => (
                <div
                  key={u.sourceId}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-blue/40 bg-blue/10 px-4 py-2.5 text-sm text-blue"
                >
                  <ArrowUpCircle size={16} className="shrink-0 text-blue" />
                  <span className="text-foreground/90">
                    A newer version (v{u.latestVersion}) of{" "}
                    <span className="font-medium">{u.name}</span> is available — you&apos;re on v
                    {u.pinnedVersion}.
                  </span>
                  {canAsk && (
                    <button
                      onClick={() => adopt(u.sourceId, u.latestVersion)}
                      disabled={adopting === u.sourceId}
                      className="ml-auto rounded-lg border border-blue/50 bg-blue/15 px-3 py-1 text-xs font-medium text-blue hover:bg-blue/25 disabled:opacity-50"
                    >
                      {adopting === u.sourceId ? "Adopting…" : "Adopt"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Collapsible source document — scroll target for citation clicks */}
          {primaryDoc && (
            <SourceDocumentPanel
              orgId={orgId}
              sourceId={primaryDoc.sourceId}
              version={primaryDoc.version}
              name={primaryDoc.name}
              open={docPanelOpen}
              onToggle={setDocPanelOpen}
              cite={citeTarget}
            />
          )}

          {!hasAnyRun && (
            <div className="rounded-2xl border border-dashed border-border bg-panel/50 p-10 text-center">
              <div className="mb-3 grid place-items-center">
                <span className="grid h-12 w-12 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                  <ScanSearch size={22} />
                </span>
              </div>
              <h2 className="text-sm font-semibold text-foreground">Ask anything about this data</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                The agent will plan, write Python, run it against your data, chart the results,
                and deliver an executive report — with every step visible.
              </p>
              {canAsk && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  {suggested.map((raw, i) => {
                    const s = normalizeSuggestion(raw);
                    return (
                      <button
                        key={`${s.label}-${i}`}
                        onClick={() => ask(s.question)}
                        title={s.question}
                        className="rounded-lg border border-border bg-panel px-3 py-1.5 text-xs text-foreground/80 hover:border-accent/50 hover:text-foreground"
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {persistedRuns.map((run, i) => (
            <RunBlock
              key={i}
              question={run.question}
              events={run.events}
              live={false}
              error={run.error}
              orgId={orgId}
              messageId={run.messageId}
              canShare={canAsk}
              suggestions={
                canAsk && i === persistedRuns.length - 1 && liveQuestion === null
                  ? run.suggestions
                  : null
              }
              onAsk={canAsk ? ask : undefined}
            />
          ))}

          {liveQuestion !== null && (
            <RunBlock
              question={liveQuestion}
              events={liveEvents}
              live={running}
              error={liveError}
              orgId={orgId}
              messageId={null}
              canShare={false}
            />
          )}

          <div ref={endRef} />
        </div>
        </CitationProvider>
      </div>

      {/* Ask bar — polished, sticky footer */}
      <footer className="sticky bottom-0 shrink-0 border-t border-border bg-background/85 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-panel px-2 py-1.5 shadow-sm transition focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/30">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") ask();
              }}
              placeholder={
                canAsk
                  ? hasAnyRun
                    ? "Ask a follow-up question about this data…"
                    : "What do you want to know about this data?"
                  : "Viewers can read analyses but not run them."
              }
              disabled={!canAsk || running}
              className="h-9 min-w-0 flex-1 basis-full bg-transparent px-2 text-sm text-foreground placeholder:text-muted/60 outline-none disabled:opacity-50 sm:basis-0"
            />
            <div className="ml-auto flex items-center gap-1.5">
              <label
                className="flex items-center gap-1.5 text-[11px] text-muted"
                title="Analysis depth — deeper takes longer"
              >
                <span className="hidden sm:inline">Depth</span>
                <select
                  value={effort}
                  onChange={(e) => setEffort(e.target.value as AnalysisEffort)}
                  disabled={!canAsk || running}
                  className="h-9 rounded-lg border border-border bg-panel-2 px-2 text-xs text-foreground outline-none focus:border-accent/60 disabled:opacity-50"
                >
                  {EFFORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="primary"
                onClick={() => ask()}
                disabled={!canAsk || running || !input.trim()}
                className="h-9 gap-1.5 rounded-lg"
              >
                {running ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
                {running ? "Analyzing…" : "Ask"}
              </Button>
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] leading-relaxed text-muted">
            The agent answers only from the datasets in this conversation. Schema, a 20-row sample,
            and printed outputs are sent to the model — never the full file. Every run is audited.
          </p>
        </div>
      </footer>
    </div>
  );
}
