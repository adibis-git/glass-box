// Public, read-only report page. No org or user data is exposed — just the
// report, its charts, and when it was generated. Every view is audited.

import { notFound } from "next/navigation";
import { ScanSearch } from "lucide-react";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ReportPanel } from "@/components/ReportPanel";
import { ChartRenderer } from "@/components/ChartRenderer";
import { fmtDate } from "@/lib/utils";
import type { ChartSpec, FinalReport } from "@/lib/types";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const snapshot = await prisma.reportSnapshot.findFirst({
    where: { shareToken: token, revokedAt: null },
  });
  if (!snapshot) notFound();

  await audit({
    orgId: snapshot.orgId,
    actorId: null,
    action: "report.share_view",
    targetType: "report",
    targetId: snapshot.id,
  });

  const report = snapshot.report as unknown as FinalReport;
  const charts = (snapshot.charts as unknown as ChartSpec[]) ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-panel/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md border border-accent/40 bg-accent/15 text-accent">
              <ScanSearch size={16} />
            </span>
            <span className="font-semibold tracking-tight text-foreground">Glass Box</span>
          </div>
          <span className="text-xs text-muted">Shared report · read-only</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{snapshot.title}</h1>
          <p className="mt-0.5 text-xs text-muted">
            Generated {fmtDate(snapshot.createdAt)} by an AI analyst with every step
            audited. Charts contain aggregated values derived from the source data.
          </p>
        </div>
        <ReportPanel report={report} />
        {charts.map((spec, i) => (
          <ChartRenderer key={i} spec={spec} />
        ))}
        <footer className="pt-6 text-center text-xs text-muted">
          Made with <span className="text-accent">Glass Box</span> — the governed AI analyst
          that shows its evidence, across data and documents.
        </footer>
      </main>
    </div>
  );
}
