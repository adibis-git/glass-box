"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

const inputCls =
  "w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-foreground placeholder:text-muted/70 outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20";

/**
 * Lead-capture form for the marketing site (Book-a-demo / Contact). Posts to
 * /api/leads, which stores the Lead in-DB for review in /app/admin/leads. No
 * external sending — this is a self-hosted lead inbox.
 */
export function LeadForm({ source = "demo" }: { source?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("loading");
    setError("");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, source }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong. Please try again.");
      }
      setState("done");
      form.reset();
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-green/40 bg-green/10 p-6 text-center">
        <CheckCircle2 className="mx-auto text-green" size={28} />
        <h3 className="mt-3 text-base font-semibold text-foreground">Thanks — we&apos;ll be in touch.</h3>
        <p className="mt-1.5 text-sm text-muted">
          A member of the team will reach out to schedule your walkthrough and scope a
          deployment for your organization.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Name*</label>
          <input name="name" required className={inputCls} placeholder="Priya Sharma" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Work email*</label>
          <input name="email" type="email" required className={inputCls} placeholder="priya@acme.com" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Company</label>
          <input name="company" className={inputCls} placeholder="Acme Health Systems" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Role</label>
          <input name="role" className={inputCls} placeholder="VP, Revenue Operations" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          What would you like to operationalize?
        </label>
        <textarea
          name="message"
          rows={3}
          className={inputCls}
          placeholder="We want our sales, finance and procurement teams analyzing their own data and contracts — self-hosted, on our VPC."
        />
      </div>
      {state === "error" && <p className="text-xs text-red">{error}</p>}
      <Button type="submit" variant="primary" disabled={state === "loading"} className="w-full sm:w-auto">
        {state === "loading" ? (
          <>
            <Loader2 size={15} className="animate-spin" /> Sending…
          </>
        ) : (
          "Request your walkthrough"
        )}
      </Button>
      <p className="text-[11px] text-muted">
        We&apos;ll only use your details to respond to this request. No spam, no third-party
        sharing. See our{" "}
        <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
      </p>
    </form>
  );
}
