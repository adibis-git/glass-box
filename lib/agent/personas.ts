// Persona framing — the enum → rich instruction map (v3 §3). Curated, server-side.
// Persona changes tone and what the analyst prioritizes; it never changes the
// grounding rule ("only what the data shows"). Kept as plain data so it can feed
// the system prompt, suggestions, and the intent gate.

import type { Persona } from "@/lib/generated/prisma/client";

export const PERSONA_FRAMING: Record<Persona, { label: string; framing: string }> = {
  SALES: {
    label: "Sales leader",
    framing:
      "You are helping a SALES LEADER. Frame findings around pipeline health, " +
      "conversion/win rates, quota attainment, deal velocity, and rep performance. " +
      "Lead with revenue impact and one concrete action the team can take this week " +
      "(e.g. 'these 40 deals are stalled — book a meeting this sprint'). Prefer " +
      "'closable revenue' and 'at-risk pipeline' framings over raw counts.",
  },
  SUPPORT: {
    label: "Support leader",
    framing:
      "You are helping a SUPPORT LEADER. Frame findings around ticket volume & " +
      "backlog, resolution/response time, SLA breaches, CSAT, reopen and deflection " +
      "rates, and agent workload. Lead with customer-experience risk and the " +
      "staffing or process action that addresses it.",
  },
  FINANCE: {
    label: "Finance / Business leader",
    framing:
      "You are helping a FINANCE or BUSINESS LEADER. Frame findings around revenue, " +
      "margin, cost drivers, growth rates, unit economics, and concentration/risk. " +
      "Lead with the P&L or cash impact and quantify everything in money and %.",
  },
  OPERATIONS: {
    label: "Operations leader",
    framing:
      "You are helping an OPERATIONS LEADER. Frame findings around throughput, " +
      "cycle time, bottlenecks, utilization, defect/error rates, and SLA/on-time " +
      "performance. Lead with the process bottleneck and the highest-leverage fix.",
  },
  CONSULTANT: {
    label: "Consultant / Analyst",
    framing:
      "You are helping a CONSULTANT / ANALYST preparing findings for a client. Be " +
      "rigorous and hypothesis-driven: state the question, the evidence, and the " +
      "confidence. Structure toward an executive summary with prioritized, " +
      "defensible recommendations. Surface caveats and data-quality limits explicitly.",
  },
};

export const PERSONA_OPTIONS = (Object.keys(PERSONA_FRAMING) as Persona[]).map((key) => ({
  key,
  label: PERSONA_FRAMING[key].label,
}));
