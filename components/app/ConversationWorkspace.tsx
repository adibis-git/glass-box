"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { feedReducer, initialFeedState, type FeedState } from "@/lib/feed";
import { fmtInt } from "@/lib/utils";
import { streamQuestion } from "@/lib/agent/streamClient";
import type { AgentEvent } from "@/lib/agent/events";
import { FeedCard } from "@/components/FeedCard";
import { ReportPanel, ReportComposing } from "@/components/ReportPanel";
import { ChartRenderer } from "@/components/ChartRenderer";
import { Button } from "@/components/ui/Button";
import type { AnalysisEffort } from "@/lib/generated/prisma/enums";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

const EFFORT_OPTIONS: { value: AnalysisEffort; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

interface MessageProp {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string | null;
  events: AgentEvent[] | null;
  status: string;
  error: string | null;
  suggestions: string[] | null;
}

interface ConversationProp {
  id: string;
  title: string;
  defaultEffort: AnalysisEffort;
  starterQuestions: string[];
  datasets: { alias: string; name: string; sampled: boolean; rowCount: number | null; version?: number }[];
  messages: MessageProp[];
}

function SuggestionChips({ items, onPick }: { items: string[]; onPick: (q: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pl-9">
      {items.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="rounded-lg border border-border bg-panel px-3 py-1.5 text-xs text-foreground/80 hover:border-accent/50 hover:text-foreground"
        >
          {s}
        </button>
      ))}
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
      <a href={link} target="_blank" className="text-xs text-green hover:underline">
        ✓ Link copied — open shared report ↗
      </a>
    );
  return (
    <button
      onClick={share}
      disabled={state === "busy"}
      className="text-xs text-muted hover:text-accent"
    >
      {state === "busy" ? "Creating link…" : "🔗 Share this report"}
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
  suggestions?: string[] | null;
  onAsk?: (q: string) => void;
}) {
  const state = useMemo(() => replay(events), [events]);
  const steps = state.feed.filter((f) => f.kind === "code").length;
  const corrections = state.feed.filter((f) => f.kind === "correction").length;

  return (
    <div className="space-y-4">
      {/* Question */}
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-sm">
          ❓
        </span>
        <div className="rounded-xl rounded-tl-sm border border-border bg-panel px-4 py-2.5 text-sm text-foreground/90">
          {question}
        </div>
      </div>

      {/* Live progress line */}
      {live && state.status === "running" && (
        <div className="flex items-center gap-2 pl-9 text-xs text-muted">
          <span className="gb-pulse">◍</span>
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
              <span>🚫</span>
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

        {/* Collapsible agent trace — the glass box */}
        {state.feed.length > 0 && (
          <details className="group rounded-xl border border-border bg-panel/60" open={live}>
            <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-medium text-muted hover:text-foreground">
              🔎 Agent trace — {steps} step{steps === 1 ? "" : "s"}
              {corrections > 0 && (
                <span className="ml-1 text-amber">incl. {corrections} self-correction{corrections === 1 ? "" : "s"}</span>
              )}
              <span className="ml-2 text-[10px] uppercase tracking-wide">
                (plan · code · output · fixes — nothing hidden)
              </span>
            </summary>
            <div className="space-y-3 border-t border-border p-3">
              {state.feed.map((item) => (
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

export function ConversationWorkspace({
  orgId,
  myRole,
  conversation,
  personaLabel,
  domain,
}: {
  orgId: string;
  myRole: Role;
  conversation: ConversationProp;
  personaLabel?: string | null;
  domain?: string | null;
}) {
  const router = useRouter();
  const canAsk = myRole !== "VIEWER";

  // Persisted runs: pair USER question → following ASSISTANT events.
  const persistedRuns = useMemo(() => {
    const runs: {
      question: string;
      events: AgentEvent[];
      error: string | null;
      messageId: string | null;
      suggestions: string[];
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
  const suggested = conversation.starterQuestions.length
    ? conversation.starterQuestions
    : [
        "Explore this data and surface the most important insights",
        "What changed over time, and where is it concentrated?",
        "What should we act on first, based on this data?",
      ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-panel/60 px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-foreground">{conversation.title}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {conversation.datasets.map((d) => (
                <span
                  key={d.alias}
                  className="rounded border border-border bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-foreground/75"
                  title={`${d.name}${d.rowCount ? ` · ${fmtInt(d.rowCount)} rows` : ""}`}
                >
                  {d.alias} = {d.name}
                  {d.version ? <span className="text-muted"> v{d.version}</span> : null}
                  {d.sampled && <span className="text-amber"> (sample)</span>}
                </span>
              ))}
            </div>
          </div>
          {running && (
            <span className="gb-pulse shrink-0 text-xs text-accent">● analyzing</span>
          )}
        </div>
        {(personaLabel || domain) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            {personaLabel && (
              <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-accent">
                {personaLabel}
              </span>
            )}
            {domain && <span className="truncate">Context: {domain}</span>}
          </div>
        )}
      </div>

      {/* Runs */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {!hasAnyRun && (
            <div className="rounded-2xl border border-dashed border-border bg-panel/50 p-10 text-center">
              <div className="mb-3 text-4xl">🔎</div>
              <h2 className="text-sm font-semibold text-foreground">Ask anything about this data</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                The agent will plan, write Python, run it against your data, chart the results,
                and deliver an executive report — with every step visible.
              </p>
              {canAsk && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  {suggested.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-lg border border-border bg-panel px-3 py-1.5 text-xs text-foreground/80 hover:border-accent/50 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
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
              suggestions={canAsk ? run.suggestions : null}
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
      </div>

      {/* Ask bar */}
      <div className="border-t border-border bg-panel/60 px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
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
            className="h-10 flex-1 rounded-xl border border-border bg-panel-2 px-4 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-accent/60 disabled:opacity-50"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-muted" title="Analysis depth — deeper takes longer">
            <span className="hidden sm:inline">Depth</span>
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value as AnalysisEffort)}
              disabled={!canAsk || running}
              className="h-10 rounded-xl border border-border bg-panel-2 px-2 text-xs text-foreground outline-none focus:border-accent/60 disabled:opacity-50"
            >
              {EFFORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" onClick={() => ask()} disabled={!canAsk || running || !input.trim()}>
            {running ? "Analyzing…" : "Ask"}
          </Button>
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl text-[10px] text-muted">
          The agent answers only from the datasets in this conversation. Schema, a 20-row sample,
          and printed outputs are sent to the model — never the full file. Every run is audited.
        </p>
      </div>
    </div>
  );
}
