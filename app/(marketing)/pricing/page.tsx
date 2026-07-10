import Link from "next/link";
import type { Metadata } from "next";
import {
  Check,
  ArrowRight,
  Rocket,
  Users,
  Building2,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LeadForm } from "@/components/marketing/LeadForm";

export const metadata: Metadata = {
  title: "Pricing — Glass Box, the self-hosted governed AI analyst",
  description:
    "Start with a free 10-day trial, then scope a customized self-hosted deployment on your own infrastructure. Every enterprise deployment is priced to your data, personas, and infra — book a demo for a tailored quote.",
};

type Tier = {
  name: string;
  tagline: string;
  icon: typeof Rocket;
  price: string;
  priceNote: string;
  cta: { label: string; href: string; variant: "primary" | "secondary" };
  featured?: boolean;
  features: string[];
};

const TIERS: Tier[] = [
  {
    name: "10-day Trial",
    tagline: "Spin it up yourself and see the analyst work end to end.",
    icon: Rocket,
    price: "Free",
    priceNote: "No card required",
    cta: { label: "Start a 10-day trial", href: "/signup", variant: "secondary" },
    features: [
      "A hosted workspace in minutes",
      "Upload synthetic or real data and documents",
      "Full analyst end to end — Python, citations, decision reports",
      "Effort dial (Low / Medium / High), powered by claude-sonnet-5",
      "Converts into a conversation about deploying on your infra",
    ],
  },
  {
    name: "Team",
    tagline: "A managed, shared workspace for a group ready to operationalize.",
    icon: Users,
    price: "Contact us",
    priceNote: "Scoped to your team",
    cta: { label: "Talk to us", href: "/demo", variant: "secondary" },
    features: [
      "Everything in the trial, kept running",
      "Shared workspace with per-request RBAC",
      "Roles: OWNER / ADMIN / MEMBER / VIEWER",
      "Usage metering and per-org rate limiting",
      "Shareable, revocable report links",
      "SSO on the roadmap",
    ],
  },
  {
    name: "Enterprise",
    tagline: "A customized Glass Box deployed on your own infrastructure.",
    icon: Building2,
    price: "Contact us",
    priceNote: "Custom self-hosted deployment",
    cta: { label: "Book a demo", href: "/demo", variant: "primary" },
    featured: true,
    features: [
      "Self-hosted on your VPC or Docker — no data egress",
      "Postgres + a single Node service, fully yours",
      "Your roles, retention, and connectors",
      "Persona-aware prompts tuned to your use case",
      "Full audit trail and usage governance",
      "Priority support and full ownership",
    ],
  },
];

export default async function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-10 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
          <span className="text-accent">●</span> Priced to your deployment
        </div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Try it free.<span className="text-accent"> Own it in production.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Start with a self-serve 10-day trial. The real offering is a customized, self-hosted
          Glass Box on your own infrastructure — scoped to your data, personas, and use case.
        </p>
      </section>

      {/* Tiers */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`flex h-full flex-col rounded-2xl border bg-panel p-6 ${
                t.featured
                  ? "border-accent/40 shadow-2xl shadow-black/20"
                  : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                  <t.icon size={18} />
                </div>
                {t.featured && (
                  <span className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    The real offering
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">{t.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.tagline}</p>
              <div className="mt-4 border-t border-border pt-4">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {t.price}
                </div>
                <div className="mt-0.5 text-xs text-muted">{t.priceNote}</div>
              </div>
              <ul className="mt-4 flex-1 space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted">
                    <Check size={15} className="mt-0.5 shrink-0 text-green" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Link href={t.cta.href} className="block">
                  <Button variant={t.cta.variant} className="w-full">
                    {t.cta.label}
                    {t.cta.variant === "primary" && <ArrowRight size={16} />}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why no prices */}
      <section className="border-y border-border bg-panel/40">
        <div className="mx-auto max-w-4xl px-6 py-14">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-accent/40 bg-accent/15 text-accent">
              <HelpCircle size={22} />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Why no prices?</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted">
              Because a real Glass Box isn&apos;t a seat you swipe a card for — it&apos;s a
              deployment scoped to your infrastructure, your data volume, and the personas you
              want reasoning over it. A five-person finance team and a regulated health network
              buy very different things. Book a demo and we&apos;ll scope it and quote it
              against your actual environment.
            </p>
            <div className="mt-7 flex justify-center">
              <Link href="/demo">
                <Button variant="secondary">
                  Book a demo for a quote <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Lead form */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-2xl border border-border bg-panel p-6 sm:p-8">
          <div className="mb-6 max-w-xl">
            <h2 className="text-xl font-semibold tracking-tight">Get a tailored quote</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Tell us what you want to operationalize and where it needs to run. We&apos;ll come
              back with a deployment plan and a price scoped to your environment.
            </p>
          </div>
          <LeadForm source="pricing" />
        </div>
      </section>
    </>
  );
}
