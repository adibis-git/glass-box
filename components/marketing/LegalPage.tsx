// Shared shell for the legal/policy template pages. Renders a constrained prose
// container, the document title, a "last updated" line, and a prominent amber
// caveat callout making clear these are templates — not legal advice. Body
// content is composed from the exported <LegalSection> / <LegalP> helpers so the
// five policy pages stay visually consistent.

import * as React from "react";
import { AlertTriangle } from "lucide-react";

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-sm text-muted">Last updated: {lastUpdated}</p>

      <div className="mt-6 flex gap-3 rounded-xl border border-amber/40 bg-amber/10 p-4">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber" />
        <p className="text-sm leading-relaxed text-foreground/90">
          <span className="font-semibold text-foreground">This document is a template</span>{" "}
          provided for informational purposes only and does not constitute legal advice.
          Review and adapt it with qualified counsel before relying on it in production. It
          contains placeholders (jurisdictions, entity names, contact details) that you must
          complete for your organization.
        </p>
      </div>

      <div className="mt-8">{children}</div>
    </section>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <h2 className="mt-8 mb-2 text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </>
  );
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-muted">{children}</p>;
}

// Convenience: a compact bulleted list styled to match LegalP body copy.
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mb-3 space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted">
          <span className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-accent" />
          <span className="min-w-0 flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}
