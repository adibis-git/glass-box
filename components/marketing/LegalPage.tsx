// Shared shell for the legal/policy pages. Renders a constrained prose container,
// the document title, and a "last updated" line. Body content is composed from the
// exported <LegalSection> / <LegalP> helpers so the five policy pages stay
// visually consistent.

import * as React from "react";

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
