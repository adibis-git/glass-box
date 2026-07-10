"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  MessagesSquare,
  Database,
  Users,
  CornerDownLeft,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Result shapes (mirror app/api/orgs/[oid]/search/route.ts) ────────────────
type ConversationHit = { id: string; title: string };
type DatasetHit = { id: string; name: string; kind: string };
type MemberHit = { userId: string; name: string | null; email: string; role: string };
type SearchResponse = {
  conversations: ConversationHit[];
  datasets: DatasetHit[];
  members: MemberHit[];
};

/** A flat, navigable row — the keyboard cursor walks this list. */
type FlatItem = {
  key: string;
  href: string;
  label: string;
  sublabel?: string;
  group: string;
  groupIcon: LucideIcon;
};

const EMPTY: SearchResponse = { conversations: [], datasets: [], members: [] };

function flatten(r: SearchResponse): FlatItem[] {
  const items: FlatItem[] = [];
  for (const c of r.conversations) {
    items.push({
      key: `conversation-${c.id}`,
      href: `/app/conversations/${c.id}`,
      label: c.title,
      group: "Conversations",
      groupIcon: MessagesSquare,
    });
  }
  for (const d of r.datasets) {
    items.push({
      key: `dataset-${d.id}`,
      href: `/app/datasets/${d.id}`,
      label: d.name,
      sublabel: d.kind.toLowerCase(),
      group: "Datasets",
      groupIcon: Database,
    });
  }
  for (const m of r.members) {
    items.push({
      key: `member-${m.userId}`,
      href: `/app/members`,
      label: m.name ?? m.email,
      sublabel: m.name ? m.email : m.role.toLowerCase(),
      group: "Members",
      groupIcon: Users,
    });
  }
  return items;
}

export function GlobalSearch({
  orgId,
  variant = "bar",
  enableHotkey = false,
}: {
  orgId: string;
  /** "bar" = inline input + dropdown (desktop TopBar); "icon" = launcher button (mobile). */
  variant?: "bar" | "icon";
  /** Attach the global ⌘K / Ctrl+K window listener (desktop instance only). */
  enableHotkey?: boolean;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResponse>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const barInputRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const flat = useMemo(() => flatten(results), [results]);
  const hasQuery = q.trim().length >= 2;

  // ── Debounced fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/orgs/${orgId}/search?q=${encodeURIComponent(term)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as SearchResponse;
        setResults({
          conversations: data.conversations ?? [],
          datasets: data.datasets ?? [],
          members: data.members ?? [],
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResults(EMPTY);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, orgId]);

  // Reset the cursor whenever the result set changes.
  useEffect(() => setActive(0), [flat.length]);

  // ── Global ⌘K / Ctrl+K listener (desktop instance) ─────────────────────────
  const openModal = useCallback(() => {
    setDropdownOpen(false);
    setModalOpen(true);
  }, []);

  useEffect(() => {
    if (!enableHotkey) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setModalOpen((v) => !v);
        setDropdownOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enableHotkey]);

  // Autofocus the modal input when it opens.
  useEffect(() => {
    if (modalOpen) {
      const id = requestAnimationFrame(() => modalInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [modalOpen]);

  // Close the desktop dropdown on outside click.
  useEffect(() => {
    if (!dropdownOpen) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [dropdownOpen]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const go = useCallback(
    (href: string) => {
      setModalOpen(false);
      setDropdownOpen(false);
      setQ("");
      router.push(href);
    },
    [router],
  );

  function onInputKeyDown(e: React.KeyboardEvent, inModal: boolean) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (inModal) setModalOpen(false);
      else setDropdownOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[active];
      if (item) go(item.href);
    }
  }

  // ── Modal focus trap (keep Tab within the dialog) ──────────────────────────
  function onModalKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ── Shared results body (used by dropdown + modal) ─────────────────────────
  function ResultsBody({ inModal }: { inModal: boolean }) {
    if (!hasQuery) {
      return (
        <div className="px-4 py-6 text-center text-sm text-muted">
          Type to search conversations, datasets, and members.
        </div>
      );
    }
    if (loading && flat.length === 0) {
      return (
        <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Searching…
        </div>
      );
    }
    if (flat.length === 0) {
      return (
        <div className="px-4 py-6 text-center text-sm text-muted">
          No results for <span className="text-foreground">“{q.trim()}”</span>.
        </div>
      );
    }

    // Group consecutive items, rendering a header before each group's first row.
    let cursor = -1;
    return (
      <div className="py-1.5">
        {flat.map((item) => {
          cursor += 1;
          const idx = cursor;
          const prev = idx > 0 ? flat[idx - 1] : null;
          const showHeader = !prev || prev.group !== item.group;
          const GroupIcon = item.groupIcon;
          const isActive = idx === active;
          return (
            <div key={item.key}>
              {showHeader && (
                <div className="flex items-center gap-1.5 px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  <GroupIcon size={12} /> {item.group}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActive(idx)}
                onClick={() => go(item.href)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-4 py-2 text-left",
                  isActive ? "bg-accent/15 text-accent" : "text-foreground/85 hover:bg-panel-2",
                )}
              >
                <GroupIcon size={15} className={cn("shrink-0", isActive ? "text-accent" : "text-muted")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{item.label}</span>
                  {item.sublabel && (
                    <span className="block truncate text-xs text-muted">{item.sublabel}</span>
                  )}
                </span>
                {isActive && <CornerDownLeft size={13} className="shrink-0 text-accent/70" />}
              </button>
            </div>
          );
        })}
        {inModal && (
          <div className="mt-1 flex items-center gap-3 border-t border-border px-4 pt-2 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-panel-2 px-1">↑</kbd>
              <kbd className="rounded border border-border bg-panel-2 px-1">↓</kbd> to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-panel-2 px-1">↵</kbd> to open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-panel-2 px-1">esc</kbd> to close
            </span>
          </div>
        )}
      </div>
    );
  }

  // ── Icon variant (mobile launcher) ─────────────────────────────────────────
  const launcher =
    variant === "icon" ? (
      <button
        type="button"
        onClick={openModal}
        aria-label="Search"
        className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-panel-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <Search size={18} />
      </button>
    ) : null;

  // ── Bar variant (desktop inline input + dropdown) ──────────────────────────
  const bar =
    variant === "bar" ? (
      <div ref={rootRef} className="relative w-full max-w-xs">
        <div className="pointer-events-none absolute inset-y-0 left-0 grid w-9 place-items-center text-muted">
          <Search size={15} />
        </div>
        <input
          ref={barInputRef}
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          onKeyDown={(e) => onInputKeyDown(e, false)}
          placeholder="Search conversations, datasets, members…"
          aria-label="Search"
          className="h-9 w-full rounded-lg border border-border bg-panel-2 pl-9 pr-14 text-sm text-foreground placeholder:text-muted/70 outline-none focus:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <kbd className="rounded border border-border bg-panel px-1.5 py-0.5 text-[10px] font-medium text-muted">
            ⌘K
          </kbd>
        </div>

        {dropdownOpen && (q.length > 0 || flat.length > 0) && (
          <div className="absolute left-0 right-0 z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-panel shadow-xl">
            <ResultsBody inModal={false} />
          </div>
        )}
      </div>
    ) : null;

  return (
    <>
      {bar}
      {launcher}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
          <button
            aria-label="Close search"
            onClick={() => setModalOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            onKeyDown={onModalKeyDown}
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search size={16} className="shrink-0 text-muted" />
              <input
                ref={modalInputRef}
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => onInputKeyDown(e, true)}
                placeholder="Search conversations, datasets, members…"
                aria-label="Search"
                className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted/70 outline-none"
              />
              {loading && <Loader2 size={15} className="shrink-0 animate-spin text-muted" />}
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              <ResultsBody inModal />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
