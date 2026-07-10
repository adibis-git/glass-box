import Link from "next/link";
import { ScanSearch } from "lucide-react";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/use-cases", label: "Use cases" },
      { href: "/pricing", label: "Pricing" },
      { href: "/demo", label: "Book a demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
      { href: "/faq", label: "FAQ" },
      { href: "/demo", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/cookies", label: "Cookies" },
      { href: "/security", label: "Security & Trust" },
      { href: "/dpa", label: "DPA" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-panel/40">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                <ScanSearch size={18} />
              </span>
              <span className="text-lg font-semibold tracking-tight">Glass Box</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              The governed AI analyst your team owns — self-hosted, evidence-first, powered
              by claude-sonnet-5.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="text-xs font-semibold uppercase tracking-wide text-foreground">
                {col.title}
              </div>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="text-sm text-muted transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Glass Box. All rights reserved.</span>
          <span>Built with Claude · India Builds with Claude</span>
        </div>
      </div>
    </footer>
  );
}
