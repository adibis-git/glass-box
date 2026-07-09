"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Compact, dark-theme prose renderer for assistant answers, report summaries,
// and plan text. Constrained to safe inline/block elements — no raw HTML — so
// `**$45,046**` renders bold rather than literal asterisks. Block spacing is
// kept tight to sit comfortably inside chat bubbles and cards.
const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded-lg border border-border bg-panel-2 p-3 font-mono text-[0.8em] leading-relaxed text-foreground/90">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[0.85em] text-accent">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-2 first:mt-0 last:mb-0">{children}</pre>,
  ul: ({ children }) => <ul className="my-1.5 space-y-1 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-1 pl-4 first:mt-0 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex gap-2 [ol_&]:list-item [ol_&]:pl-0.5">
      <span className="mt-[0.4em] hidden h-1 w-1 shrink-0 rounded-full bg-accent [ul_&]:block" />
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  ),
  h1: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold text-foreground first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold text-foreground first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-2.5 text-[13px] font-semibold text-foreground first:mt-0">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-accent/50 pl-3 text-foreground/80 first:mt-0 last:mb-0">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-border first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border bg-panel-2 px-2.5 py-1.5 text-left font-semibold text-foreground/80">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/60 px-2.5 py-1.5 align-top text-foreground/80">{children}</td>
  ),
  hr: () => <hr className="my-3 border-border" />,
};

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("gb-prose text-sm leading-relaxed text-foreground/90", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
