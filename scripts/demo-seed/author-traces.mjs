// Authors schema-correct Message.events (+ report/suggestions) for every seed
// ASSISTANT message so each seeded demo conversation renders like a real agent
// run. Pure JS: reads scratchpad/seed_convs.json, writes scratchpad/traces.sql.
// No DB / no network. Numbers are derived from a stable per-conversation seed so
// they are internally consistent (answer == execution == chart == report) and
// vary across conversations.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRATCH =
  "/tmp/claude-1001/-home-clawbis/f948fd25-288d-49c1-be8a-770c6ca9c12f/scratchpad";
const convs = JSON.parse(readFileSync(join(SCRATCH, "seed_convs.json"), "utf8"));

// ---- real datasets (org cmrdcdi2b000101qufya5h0bg) --------------------------
const SRC = {
  prospects: {
    sourceId: "cmrdcdol4000301qu6jevwa8v",
    versionId: "cmrdce5vo000501quenvk0n07",
    alias: "df",
    name: "sales_prospects",
  },
  cloud: {
    sourceId: "cmrdtkl9x000001q8s7dhrkj6",
    versionId: "cmrdtkl9z000101q84vqyyzur",
    alias: "df",
    name: "cloud_sales_performance",
  },
  rfp: {
    sourceId: "cmrde1eyw000001lvkxgw4llu",
    versionId: "cmrde3oqk000501lvqikq5ylz",
    alias: "rfp",
    name: "vendor_rfp_v1",
  },
};

// ---- deterministic RNG ------------------------------------------------------
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mkRng = (id) => mulberry32(hash32(id));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const rint = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const rfloat = (rng, lo, hi, d = 1) => {
  const v = lo + rng() * (hi - lo);
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

// ---- id + escape helpers ----------------------------------------------------
function eventIdFactory(convId) {
  let n = 0;
  const base = convId.replace(/^seed_/, "");
  return (kind) => `ev_${base.slice(0, 10)}_${kind}_${n++}`;
}
const sqlStr = (obj) => `'${JSON.stringify(obj).replace(/'/g, "''")}'`;
const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---- number formatting ------------------------------------------------------
const money = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toLocaleString("en-US")}`;
};
const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n) => `${n.toFixed(1)}%`;

// ---- domain vocab -----------------------------------------------------------
const PROSPECT_SOURCES = ["Referral", "Inbound", "Partner", "Outbound", "Event"];
const CLOUD_SOURCES = [
  "Organic Search",
  "Paid Ads",
  "Referral",
  "Webinar",
  "Cold Outreach",
];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const SIZES = ["SMB", "Mid-Market", "Enterprise"];
const REPS = ["A. Rivera", "J. Chen", "M. Okafor", "S. Kapoor", "L. Rossi"];
const PRODUCTS = ["Compute", "Storage", "Networking", "Security", "Managed DB"];
const STATUSES = ["Won", "Lost", "Negotiation", "Qualified", "New"];

// title -> tabular grouping config. Doc-modality overrides this at runtime.
const TITLE_CFG = {
  "Win rate by lead source": { ds: "prospects", dim: "lead_source", names: PROSPECT_SOURCES, kind: "winrate", chart: "bar" },
  "Q3 pipeline health by region": { ds: "prospects", dim: "quarter", names: QUARTERS, kind: "pipeline", chart: "area" },
  "Top accounts at risk this quarter": { ds: "prospects", dim: "company_size", names: SIZES, kind: "risk", chart: "bar" },
  "Renewals forecast by cohort": { ds: "prospects", dim: "quarter", names: QUARTERS, kind: "renewals", chart: "line" },
  "Regional sales variance vs forecast": { ds: "cloud", dim: "Lead_Source", names: CLOUD_SOURCES, kind: "variance", chart: "bar" },
  "Headcount cost model FY26": { ds: "cloud", dim: "Sales_Rep", names: REPS, kind: "revenue", chart: "bar" },
  "Data quality audit — CRM export": { ds: "cloud", dim: "Status", names: STATUSES, kind: "quality", chart: "bar" },
  "Support ticket volume trends": { ds: "cloud", dim: "Product_Pitched", names: PRODUCTS, kind: "volume", chart: "bar" },
  "Discount impact on gross margin": { ds: "cloud", dim: "Lead_Source", names: CLOUD_SOURCES, kind: "margin", chart: "bar" },
  "Client onboarding cycle times": { ds: "cloud", dim: "Sales_Rep", names: REPS, kind: "cycle", chart: "bar" },
  "Churn drivers in the SMB segment": { ds: "cloud", dim: "Product_Pitched", names: PRODUCTS, kind: "churn", chart: "bar" },
  "Cash-flow sensitivity analysis": { ds: "cloud", dim: "Lead_Source", names: CLOUD_SOURCES, kind: "cashflow", chart: "bar" },
  "Marketing spend efficiency by channel": { ds: "cloud", dim: "Lead_Source", names: CLOUD_SOURCES, kind: "efficiency", chart: "bar" },
  "Contract SLA comparison (v1 vs v2)": { ds: "cloud", dim: "Lead_Source", names: CLOUD_SOURCES, kind: "variance", chart: "bar" },
  "Vendor RFP compliance review": { ds: "cloud", dim: "Status", names: STATUSES, kind: "quality", chart: "bar" },
};

// natural user question per title
const QUESTION = {
  "Win rate by lead source": "What's our win rate by lead source, and which channel converts best?",
  "Q3 pipeline health by region": "How healthy is the Q3 pipeline — where is value concentrated?",
  "Top accounts at risk this quarter": "Which accounts are most at risk this quarter and how much is exposed?",
  "Renewals forecast by cohort": "What does the renewals forecast look like by cohort?",
  "Regional sales variance vs forecast": "Where are we running ahead or behind forecast by channel?",
  "Headcount cost model FY26": "Model FY26 revenue coverage per rep — who carries the number?",
  "Data quality audit — CRM export": "Audit the CRM export — how clean is the pipeline data?",
  "Support ticket volume trends": "How is deal volume trending across product lines?",
  "Discount impact on gross margin": "What's the impact of discounting on our realized margin?",
  "Client onboarding cycle times": "How long are onboarding cycle times, and who's slowest?",
  "Churn drivers in the SMB segment": "What's driving churn risk in the SMB segment?",
  "Cash-flow sensitivity analysis": "How sensitive is cash flow to our biggest channels?",
  "Marketing spend efficiency by channel": "Which channels are the most efficient use of spend?",
  "Contract SLA comparison (v1 vs v2)": "How do the SLA terms compare between the v1 and v2 contract?",
  "Vendor RFP compliance review": "Are we compliant with the mandatory requirements in the vendor RFP?",
};

// ---- group-data generator ---------------------------------------------------
// Returns [{name, count, value}] where `value` semantics depend on kind.
function makeGroups(rng, cfg) {
  const names = cfg.names;
  const rows = names.map((name) => {
    let value;
    switch (cfg.kind) {
      case "winrate":
        value = rfloat(rng, 14, 41, 1); // %
        break;
      case "margin":
        value = rfloat(rng, 31, 62, 1); // %
        break;
      case "quality":
        value = rint(rng, 3, 260); // record counts
        break;
      case "volume":
        value = rint(rng, 40, 520); // deal counts
        break;
      case "cycle":
        value = rfloat(rng, 11, 47, 1); // days
        break;
      case "churn":
        value = rfloat(rng, 6, 33, 1); // churn %
        break;
      default: // revenue / pipeline / risk / renewals / variance / cashflow / efficiency
        value = rint(rng, 180_000, 2_400_000);
    }
    return { name, count: rint(rng, 60, 900), value };
  });
  rows.sort((a, b) => b.value - a.value);
  return rows;
}

// pandas-style Series print of the groups
function seriesPrint(indexName, valueName, groups, fmt) {
  const width = Math.max(...groups.map((g) => g.name.length));
  const body = groups
    .map((g) => `${g.name.padEnd(width + 4)}${fmt(g.value)}`)
    .join("\n");
  return `${indexName}\n${body}\nName: ${valueName}, dtype: float64`;
}

// ---- content builders per kind ----------------------------------------------
function buildTabular(convId, cfg, title, opts = {}) {
  const rng = mkRng(convId + "|" + title);
  const ds = SRC[cfg.ds];
  const groups = makeGroups(rng, cfg);
  const top = groups[0];
  const bottom = groups[groups.length - 1];
  const totalRecords = groups.reduce((s, g) => s + g.count, 0);

  // overall metric + textual answer + code + exec + chart + (report)
  let answer, code, execOut, chartTitle, chartValName, headline, summary, metrics, insights, recommendation;
  const dimLabel = cfg.dim;
  const alias = ds.alias;

  const isPct = ["winrate", "margin", "churn"].includes(cfg.kind);
  const isDays = cfg.kind === "cycle";
  const isCount = ["quality", "volume"].includes(cfg.kind);
  const isMoney = !isPct && !isDays && !isCount;

  const fmtVal = isPct
    ? (v) => `${v.toFixed(1)}`
    : isDays
    ? (v) => `${v.toFixed(1)}`
    : isCount
    ? (v) => `${v}`
    : (v) => `${Math.round(v).toLocaleString("en-US")}`;
  const prettyVal = isPct
    ? (v) => pct(v)
    : isDays
    ? (v) => `${v.toFixed(1)} days`
    : isCount
    ? (v) => `${v.toLocaleString("en-US")}`
    : (v) => usd(v);

  const overall = isPct || isDays
    ? Math.round((groups.reduce((s, g) => s + g.value * g.count, 0) / totalRecords) * 10) / 10
    : groups.reduce((s, g) => s + g.value, 0);

  switch (cfg.kind) {
    case "winrate":
      answer = `Across ${totalRecords.toLocaleString("en-US")} tracked prospects, the blended win rate is **${pct(overall)}**. **${top.name}** converts best at **${pct(top.value)}**, while **${bottom.name}** trails at ${pct(bottom.value)} — a ${(top.value - bottom.value).toFixed(1)}-point spread that concentrates conversion in a couple of channels.`;
      code = `${alias}['won'] = ${alias}['closed_value_usd'] > 0\nrate = (${alias}.groupby('lead_source')['won'].mean() * 100).round(1)\nprint(rate.sort_values(ascending=False))`;
      execOut = seriesPrint("lead_source", "won", groups, fmtVal);
      chartTitle = "Win rate by lead source (%)";
      chartValName = "win_rate";
      headline = `${top.name} leads win rate at ${pct(top.value)} — ${(top.value - bottom.value).toFixed(1)} points ahead of ${bottom.name}.`;
      summary = `Blended win rate across ${totalRecords.toLocaleString("en-US")} prospects is ${pct(overall)}. Conversion is uneven by channel: ${top.name} closes ${pct(top.value)} of opportunities while ${bottom.name} manages only ${pct(bottom.value)}. Reallocating pipeline toward the top two sources would lift the blended rate.`;
      metrics = [
        { label: "Blended win rate", value: pct(overall), trend: "up" },
        { label: "Best channel", value: `${top.name} ${pct(top.value)}`, trend: "up" },
        { label: "Weakest channel", value: `${bottom.name} ${pct(bottom.value)}`, trend: "down" },
      ];
      insights = [
        { finding: `${top.name} is the highest-converting channel at ${pct(top.value)}.`, evidence: `groupby('lead_source')['won'].mean() ranks ${top.name} first across ${top.count} prospects.`, confidence: "high" },
        { finding: `${bottom.name} underperforms at ${pct(bottom.value)}, dragging the blend.`, evidence: `Same aggregation places ${bottom.name} last with ${bottom.count} prospects.`, confidence: "high" },
        { finding: `The ${(top.value - bottom.value).toFixed(1)}-point spread means channel mix, not volume, drives results.`, evidence: `Win rate variance across the five sources exceeds intra-channel variance.`, confidence: "medium" },
      ];
      recommendation = `Shift SDR capacity toward ${top.name} and ${groups[1].name}; audit ${bottom.name} qualification criteria before spending more there.`;
      break;
    case "margin":
      answer = `Realized gross margin averages **${pct(overall)}** after discounting. Deals sourced via **${top.name}** hold **${pct(top.value)}**, but **${bottom.name}** erodes to ${pct(bottom.value)} — discounting is concentrated in the weakest channels.`;
      code = `${alias}['margin_pct'] = (${alias}['Revenue_USD'] * 0.01)  # realized margin proxy\ng = ${alias}.groupby('Lead_Source')['margin_pct'].mean().round(1)\nprint(g.sort_values(ascending=False))`;
      execOut = seriesPrint("Lead_Source", "margin_pct", groups, fmtVal);
      chartTitle = "Gross margin by channel (%)";
      chartValName = "margin_pct";
      headline = `Discounting compresses ${bottom.name} margin to ${pct(bottom.value)} vs ${pct(top.value)} for ${top.name}.`;
      summary = `Blended realized margin is ${pct(overall)}. ${top.name} deals defend pricing at ${pct(top.value)}, while ${bottom.name} slips to ${pct(bottom.value)}. The gap points to unmanaged discount approvals rather than cost structure.`;
      metrics = [
        { label: "Blended margin", value: pct(overall), trend: "flat" },
        { label: "Best channel", value: `${top.name} ${pct(top.value)}`, trend: "up" },
        { label: "Most discounted", value: `${bottom.name} ${pct(bottom.value)}`, trend: "down" },
      ];
      insights = [
        { finding: `${bottom.name} carries the deepest discounts at ${pct(bottom.value)} margin.`, evidence: `groupby('Lead_Source') margin mean ranks ${bottom.name} last.`, confidence: "high" },
        { finding: `${top.name} sustains ${pct(top.value)} with no material discounting.`, evidence: `Same aggregation ranks ${top.name} first over ${top.count} deals.`, confidence: "high" },
        { finding: `Margin spread of ${(top.value - bottom.value).toFixed(1)} pts is a pricing-governance issue.`, evidence: `Variance driven by channel, not product cost.`, confidence: "medium" },
      ];
      recommendation = `Introduce a discount-approval floor on ${bottom.name} deals and review the top 10 outliers this week.`;
      break;
    case "churn":
      answer = `SMB churn risk sits at **${pct(overall)}** blended. **${top.name}** shows the highest exposure at **${pct(top.value)}**, versus ${pct(bottom.value)} for ${bottom.name} — churn clusters around specific product lines rather than the whole book.`;
      code = `smb = ${alias}[${alias}['Status'] != 'Won']\nrisk = (smb.groupby('Product_Pitched').size() / ${alias}.groupby('Product_Pitched').size() * 100).round(1)\nprint(risk.sort_values(ascending=False))`;
      execOut = seriesPrint("Product_Pitched", "churn_pct", groups, fmtVal);
      chartTitle = "Churn risk by product line (%)";
      chartValName = "churn_pct";
      headline = `${top.name} drives SMB churn at ${pct(top.value)} — nearly ${(top.value / Math.max(bottom.value, 0.1)).toFixed(1)}x ${bottom.name}.`;
      summary = `Blended SMB churn risk is ${pct(overall)}. ${top.name} is the primary driver at ${pct(top.value)}, while ${bottom.name} is stable at ${pct(bottom.value)}. Retention effort should be product-targeted, not segment-wide.`;
      metrics = [
        { label: "SMB churn risk", value: pct(overall), trend: "down" },
        { label: "Top driver", value: `${top.name} ${pct(top.value)}`, trend: "down" },
        { label: "Most stable", value: `${bottom.name} ${pct(bottom.value)}`, trend: "up" },
      ];
      insights = [
        { finding: `${top.name} accounts churn at ${pct(top.value)}, the highest of any line.`, evidence: `Non-won share by Product_Pitched ranks ${top.name} first.`, confidence: "high" },
        { finding: `${bottom.name} is the retention anchor at ${pct(bottom.value)}.`, evidence: `Same ratio ranks ${bottom.name} last over ${bottom.count} accounts.`, confidence: "medium" },
        { finding: `Churn is product-driven, so a horizontal save play would be mis-targeted.`, evidence: `Spread across products (${(top.value - bottom.value).toFixed(1)} pts) exceeds segment noise.`, confidence: "medium" },
      ];
      recommendation = `Stand up a targeted save motion for ${top.name} SMB accounts before renewal windows open.`;
      break;
    case "cycle":
      answer = `Median onboarding runs **${overall.toFixed(1)} days**. **${top.name}** is slowest at **${top.value.toFixed(1)} days**, while ${bottom.name} closes onboarding in ${bottom.value.toFixed(1)} — a ${(top.value - bottom.value).toFixed(1)}-day spread worth standardizing.`;
      code = `${alias}['cycle_days'] = ${alias}['Meetings_Done'] * 3.5  # onboarding proxy\ng = ${alias}.groupby('Sales_Rep')['cycle_days'].mean().round(1)\nprint(g.sort_values(ascending=False))`;
      execOut = seriesPrint("Sales_Rep", "cycle_days", groups, fmtVal);
      chartTitle = "Onboarding cycle time by rep (days)";
      chartValName = "cycle_days";
      headline = `${top.name} onboards in ${top.value.toFixed(1)} days — ${(top.value - bottom.value).toFixed(1)} slower than ${bottom.name}.`;
      summary = `Average onboarding cycle is ${overall.toFixed(1)} days. ${top.name} runs longest at ${top.value.toFixed(1)} days versus ${bottom.name} at ${bottom.value.toFixed(1)}. The variance is process, not deal complexity — the fastest reps follow a tighter kickoff checklist.`;
      metrics = [
        { label: "Avg cycle", value: `${overall.toFixed(1)} days`, trend: "flat" },
        { label: "Slowest", value: `${top.name} ${top.value.toFixed(1)}d`, trend: "down" },
        { label: "Fastest", value: `${bottom.name} ${bottom.value.toFixed(1)}d`, trend: "up" },
      ];
      insights = [
        { finding: `${top.name}'s cycle of ${top.value.toFixed(1)} days is the longest.`, evidence: `groupby('Sales_Rep') cycle mean ranks ${top.name} first.`, confidence: "high" },
        { finding: `${bottom.name} completes onboarding in ${bottom.value.toFixed(1)} days.`, evidence: `Same aggregation ranks ${bottom.name} last.`, confidence: "high" },
        { finding: `A ${(top.value - bottom.value).toFixed(1)}-day spread suggests process, not deal mix.`, evidence: `Meeting counts are comparable across reps.`, confidence: "medium" },
      ];
      recommendation = `Roll the fastest rep's kickoff checklist out team-wide and set a ${Math.round(overall)}-day onboarding SLA.`;
      break;
    case "quality": {
      const dirty = groups.filter((g) => g.name === "New" || g.name === "Negotiation").reduce((s, g) => s + g.value, 0);
      const total = groups.reduce((s, g) => s + g.value, 0);
      const dirtyPct = Math.round((dirty / total) * 1000) / 10;
      answer = `The export has **${total.toLocaleString("en-US")} records**. **${dirtyPct}%** sit in ambiguous stages (\`New\`/\`Negotiation\`) with missing close data, and **${top.name}** is the single largest bucket at ${top.value.toLocaleString("en-US")} rows. Data is usable but needs stage hygiene before forecasting.`;
      code = `counts = ${alias}['Status'].value_counts()\nprint(counts)\nprint('missing Revenue:', ${alias}['Revenue_USD'].isna().sum())`;
      execOut = seriesPrint("Status", "count", groups, fmtVal) + `\nmissing Revenue: ${rint(rng, 4, 40)}`;
      chartTitle = "Record count by status";
      chartValName = "records";
      headline = `${dirtyPct}% of the ${total.toLocaleString("en-US")} exported records are in ambiguous stages.`;
      summary = `The CRM export contains ${total.toLocaleString("en-US")} records. ${dirtyPct}% are parked in \`New\` or \`Negotiation\` without a close date or revenue, which will distort any forecast built directly on this file. Core fields are otherwise complete.`;
      metrics = [
        { label: "Records", value: total.toLocaleString("en-US"), trend: "flat" },
        { label: "Ambiguous-stage", value: `${dirtyPct}%`, trend: "down" },
        { label: "Largest bucket", value: `${top.name} ${top.value.toLocaleString("en-US")}`, trend: "flat" },
      ];
      insights = [
        { finding: `${dirtyPct}% of rows lack a resolved status.`, evidence: `value_counts() shows New+Negotiation = ${dirty.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}.`, confidence: "high" },
        { finding: `${top.name} is the dominant status at ${top.value.toLocaleString("en-US")} records.`, evidence: `Status value_counts ranks ${top.name} first.`, confidence: "high" },
        { finding: `Some Revenue_USD values are null and must be excluded from sums.`, evidence: `isna().sum() on Revenue_USD returns a non-zero count.`, confidence: "medium" },
      ];
      recommendation = `Quarantine ambiguous-stage rows and re-key close dates before using this export for the forecast.`;
      break;
    }
    case "volume":
      answer = `Deal volume totals **${totalRecords.toLocaleString("en-US")}** opportunities. **${top.name}** leads with **${top.value.toLocaleString("en-US")}** deals while ${bottom.name} sits at ${bottom.value.toLocaleString("en-US")} — volume is skewing toward the top two product lines quarter over quarter.`;
      code = `vol = ${alias}.groupby('Product_Pitched').size()\nprint(vol.sort_values(ascending=False))`;
      execOut = seriesPrint("Product_Pitched", "deals", groups, fmtVal);
      chartTitle = "Deal volume by product line";
      chartValName = "deals";
      headline = `${top.name} drives the most volume at ${top.value.toLocaleString("en-US")} deals.`;
      summary = `Across ${totalRecords.toLocaleString("en-US")} deals, ${top.name} is the volume leader at ${top.value.toLocaleString("en-US")}, with ${bottom.name} trailing at ${bottom.value.toLocaleString("en-US")}. The concentration is worth watching for capacity planning.`;
      metrics = [
        { label: "Total deals", value: totalRecords.toLocaleString("en-US"), trend: "up" },
        { label: "Top line", value: `${top.name} ${top.value.toLocaleString("en-US")}`, trend: "up" },
        { label: "Lowest", value: `${bottom.name} ${bottom.value.toLocaleString("en-US")}`, trend: "down" },
      ];
      insights = [
        { finding: `${top.name} generates the highest deal volume.`, evidence: `groupby('Product_Pitched').size() ranks ${top.name} first.`, confidence: "high" },
        { finding: `${bottom.name} volume is thin at ${bottom.value.toLocaleString("en-US")} deals.`, evidence: `Same count ranks ${bottom.name} last.`, confidence: "medium" },
        { finding: `Top two lines account for the majority of throughput.`, evidence: `${top.name}+${groups[1].name} exceed half of all deals.`, confidence: "medium" },
      ];
      recommendation = `Align SE capacity to ${top.name} and ${groups[1].name}; review whether ${bottom.name} warrants continued push.`;
      break;
    default: {
      // money kinds: revenue / pipeline / risk / renewals / variance / cashflow / efficiency
      const total = groups.reduce((s, g) => s + g.value, 0);
      const share = Math.round((top.value / total) * 1000) / 10;
      const noun =
        cfg.kind === "pipeline" ? "open pipeline"
        : cfg.kind === "renewals" ? "renewal value"
        : cfg.kind === "risk" ? "at-risk value"
        : cfg.kind === "variance" ? "booked revenue"
        : cfg.kind === "cashflow" ? "cash contribution"
        : cfg.kind === "efficiency" ? "attributed revenue"
        : "revenue";
      answer = `Total ${noun} is **${money(total)}** across ${dimLabel.replace(/_/g, " ")}. **${top.name}** is the largest at **${money(top.value)}** (${share}% of the total), while ${bottom.name} contributes ${money(bottom.value)}. The book is concentrated — the top two account for ${(Math.round(((top.value + groups[1].value) / total) * 1000) / 10)}%.`;
      const col = cfg.ds === "prospects" ? "closed_value_usd" : "Revenue_USD";
      code = `g = ${alias}.groupby('${cfg.dim}')['${col}'].sum()\nprint(g.sort_values(ascending=False))\nprint('total:', int(g.sum()))`;
      execOut = seriesPrint(cfg.dim, col, groups, (v) => Math.round(v).toLocaleString("en-US")) + `\ntotal: ${Math.round(total).toLocaleString("en-US")}`;
      chartTitle = `${noun[0].toUpperCase() + noun.slice(1)} by ${dimLabel.replace(/_/g, " ")}`;
      chartValName = "value";
      headline = `${top.name} carries ${share}% of ${noun} at ${money(top.value)}.`;
      summary = `Total ${noun} is ${money(total)}. ${top.name} dominates at ${money(top.value)} (${share}%), and the top two segments together hold ${(Math.round(((top.value + groups[1].value) / total) * 1000) / 10)}% of the book. ${bottom.name} is the smallest contributor at ${money(bottom.value)}.`;
      metrics = [
        { label: `Total ${noun}`, value: money(total), trend: "up" },
        { label: "Top segment", value: `${top.name} ${money(top.value)}`, trend: "up" },
        { label: "Concentration", value: `${share}%`, trend: "flat" },
      ];
      insights = [
        { finding: `${top.name} is the single largest source of ${noun} at ${money(top.value)}.`, evidence: `groupby('${cfg.dim}')['${col}'].sum() ranks ${top.name} first.`, confidence: "high" },
        { finding: `The book is concentrated — top two segments hold ${(Math.round(((top.value + groups[1].value) / total) * 1000) / 10)}%.`, evidence: `${top.name}+${groups[1].name} = ${money(top.value + groups[1].value)} of ${money(total)}.`, confidence: "high" },
        { finding: `${bottom.name} is underweight at ${money(bottom.value)}.`, evidence: `Same aggregation ranks ${bottom.name} last.`, confidence: "medium" },
      ];
      recommendation = `Protect the ${top.name} concentration with named-account coverage and build a plan to grow ${bottom.name}.`;
    }
  }

  const chartData = groups.map((g) => ({ [dimLabel]: g.name, [chartValName]: isPct || isDays ? g.value : Math.round(g.value) }));
  const chartSpec = {
    chart_type: cfg.chart,
    title: chartTitle,
    data: chartData,
    x_key: dimLabel,
    y_keys: [chartValName],
  };

  return { ds, answer, code, execOut, chartSpec, headline, summary, metrics, insights, recommendation, groups, totalRecords };
}

// ---- document content -------------------------------------------------------
const RFP_CLAUSES = {
  c130: { section: "1. OVERVIEW", quote: "This RFP invites qualified vendors to submit proposals for a multi-year cloud migration and managed-services engagement covering compute, storage, and 24x7 operations." },
  c292: { section: "2. MANDATORY REQUIREMENTS", quote: "The vendor MUST maintain 99.95% monthly uptime and provide 24x7 support with a 15-minute response SLA for Severity-1 incidents." },
  c782: { section: "3. DESIRABLE REQUIREMENTS", quote: "Vendors SHOULD offer a FinOps dashboard with per-team cost allocation and automated anomaly alerts." },
  c922: { section: "4. LIABILITY", quote: "The vendor's aggregate liability shall not exceed the total fees paid in the twelve (12) months preceding the event giving rise to the claim." },
  c1022: { section: "5. EVALUATION", quote: "Proposals will be scored 40% technical fit, 30% price, 20% support model, and 10% references." },
};

function buildDocument(convId, title, intent) {
  const rng = mkRng(convId + "|doc|" + title);
  const isReview = intent === "decision";
  const isSla = /SLA/i.test(title);

  const cites = isSla
    ? ["c292", "c922", "c1022"]
    : ["c292", "c782", "c130"];

  let answer;
  if (isSla) {
    answer = `The **mandatory SLA (§2)** requires **99.95% monthly uptime** and a **15-minute Severity-1 response**, unchanged from v1. The material shift is in **§4 Liability**: aggregate liability is now explicitly capped at **12 months of fees**, where v1 left it uncapped. Evaluation weighting (§5) is unchanged at 40/30/20/10.`;
  } else if (isReview) {
    answer = `We are **compliant with the core mandatory requirement (§2)** — our platform meets 99.95% uptime and the 15-minute Sev-1 response. The **liability cap in §4** (12 months of fees) is acceptable as written. The gap is a **desirable item in §3**: the FinOps dashboard with per-team cost allocation is on the roadmap but not yet GA, so we should flag it as "committed, Q3" rather than "available."`;
  } else {
    answer = `The **mandatory requirements live in §2**: 99.95% monthly uptime and 24x7 support with a 15-minute Severity-1 response SLA. Desirable (non-scoring-blocking) items in §3 include a FinOps dashboard. Everything in §2 is a pass/fail gate before scoring begins.`;
  }

  return { ds: SRC.rfp, answer, cites, isReview, isSla, rng, title };
}

// ---- assemble events per assistant message ----------------------------------
function tabularEvents(nid, c, intent, bespoke, followup) {
  const ev = [];
  ev.push({ type: "status", status: "running" });
  if (intent === "decision") ev.push({ type: "step", current: 1, max: bespoke ? 4 : 3 });
  const planId = nid("plan");
  ev.push({ type: "plan_start", id: planId });
  ev.push({ type: "plan_delta", id: planId, delta: c.answer });
  ev.push({ type: "plan_end", id: planId });

  if (bespoke && intent === "decision") {
    // richer multi-step run with a self-correction
    const code1 = nid("code");
    ev.push({ type: "code", id: code1, stepDescription: "load and profile the dataset", code: `print(${c.ds.alias}.shape)\nprint(${c.ds.alias}.dtypes)\nprint(${c.ds.alias}.head(3))` });
    ev.push({ type: "execution", id: nid("exec"), output: `(${c.totalRecords}, ${c.ds.name === "sales_prospects" ? 12 : 8})\n... dtypes ok ...`, isError: false });
    // a deliberate error + correction
    const badId = nid("code");
    const badCol = c.ds.name === "sales_prospects" ? "revenue_usd" : "revenue";
    ev.push({ type: "code", id: badId, stepDescription: "aggregate the metric", code: c.code.replace(/closed_value_usd|Revenue_USD/, badCol) });
    ev.push({ type: "execution", id: nid("exec"), output: `KeyError: '${badCol}'`, isError: true });
    ev.push({ type: "correction", id: nid("corr") });
    ev.push({ type: "code", id: nid("code"), stepDescription: "aggregate the metric (corrected column)", code: c.code });
    ev.push({ type: "execution", id: nid("exec"), output: c.execOut, isError: false });
  } else {
    ev.push({ type: "code", id: nid("code"), stepDescription: "compute the aggregation", code: c.code });
    ev.push({ type: "execution", id: nid("exec"), output: c.execOut, isError: false });
  }

  // chart for analytical + decision (not plain quick_fact)
  if (intent !== "quick_fact" || bespoke) {
    ev.push({ type: "chart", id: nid("chart"), spec: c.chartSpec });
  }

  let report = null;
  if (intent === "decision") {
    ev.push({ type: "report_pending" });
    ev.push({ type: "verification", id: nid("verif"), ok: true, issues: [] });
    report = {
      headline: c.headline,
      summary: c.summary,
      metrics: c.metrics,
      insights: c.insights,
      recommendation: c.recommendation,
    };
    ev.push({ type: "report", id: nid("report"), report });
  }

  return { ev, report };
}

function suggestionsFor(title, intent) {
  const base = {
    "Win rate by lead source": [
      { label: "Trend by quarter", question: "How has win rate by lead source trended across quarters?" },
      { label: "Rep-level breakdown", question: "Break win rate down by rep within the top channel." },
      { label: "Value-weighted rate", question: "Weight the win rate by deal value instead of count." },
    ],
    "Vendor RFP compliance review": [
      { label: "List all mandatory reqs", question: "Extract every mandatory requirement as a checklist." },
      { label: "Liability exposure", question: "Summarize our liability exposure under section 4." },
      { label: "Scoring model", question: "How is the proposal scored in the evaluation section?" },
    ],
  };
  if (base[title]) return base[title];
  const generic = [
    { label: "Break down by segment", question: "Can you break that down further by segment?" },
    { label: "Show the trend", question: "How has this trended over the last few quarters?" },
    { label: "What should we act on?", question: "What's the single most important action from this?" },
  ];
  return generic.slice(0, intent === "quick_fact" ? 2 : 3);
}

function documentEvents(nid, doc, intent, bespoke) {
  const ev = [];
  ev.push({ type: "status", status: "running" });
  const planId = nid("plan");
  ev.push({ type: "plan_start", id: planId });
  ev.push({ type: "plan_delta", id: planId, delta: doc.answer });
  ev.push({ type: "plan_end", id: planId });

  for (const a of doc.cites) {
    const cl = RFP_CLAUSES[a];
    ev.push({ type: "cite", id: nid("cite"), anchor: a, quote: cl.quote, section: cl.section });
  }

  // extract table for review / mandatory-requirement questions
  const wantExtract = doc.isReview || /complian|requirement|obligation/i.test(doc.title) || bespoke;
  if (wantExtract) {
    ev.push({
      type: "extract",
      id: nid("extract"),
      title: "Mandatory & desirable requirements",
      columns: ["#", "Requirement", "Type", "Section"],
      rows: [
        ["1", "99.95% monthly uptime", "Mandatory", "§2"],
        ["2", "24x7 support, 15-min Sev-1 response", "Mandatory", "§2"],
        ["3", "FinOps dashboard, per-team cost allocation", "Desirable", "§3"],
        ["4", "Liability capped at 12 months of fees", "Mandatory", "§4"],
        ["5", "References (10% of score)", "Evaluation", "§5"],
      ],
    });
  }

  let report = null;
  if (intent === "decision") {
    ev.push({ type: "report_pending" });
    ev.push({ type: "verification", id: nid("verif"), ok: true, issues: [] });
    report = {
      headline: doc.isSla
        ? "SLA terms are unchanged; the material delta is a new 12-month liability cap in §4."
        : "Core mandatory requirements are met; one desirable FinOps item is roadmap-only.",
      summary: doc.isSla
        ? "The §2 SLA (99.95% uptime, 15-minute Sev-1 response) is identical to v1. v2 introduces an explicit liability cap in §4 at twelve months of fees, and §5 scoring weights are unchanged at 40/30/20/10."
        : "We satisfy the §2 mandatory gates (uptime and Sev-1 response) and accept the §4 liability cap. The only shortfall is the §3 FinOps dashboard, which is committed for Q3 but not yet generally available.",
      metrics: doc.isSla
        ? [
            { label: "Uptime SLA", value: "99.95%", trend: "flat" },
            { label: "Sev-1 response", value: "15 min", trend: "flat" },
            { label: "Liability cap", value: "12 mo fees", trend: "down" },
          ]
        : [
            { label: "Mandatory met", value: "2 of 2", trend: "up" },
            { label: "Desirable gap", value: "1 (FinOps)", trend: "down" },
            { label: "Liability cap", value: "12 mo fees", trend: "flat" },
          ],
      insights: [
        { finding: doc.isSla ? "SLA thresholds are unchanged between v1 and v2." : "Both mandatory SLA gates are satisfied by our platform.", evidence: `§2 states "99.95% monthly uptime … 15-minute response SLA for Severity-1 incidents." (anchor c292)`, confidence: "high" },
        { finding: doc.isSla ? "v2 adds an explicit aggregate liability cap." : "The §3 FinOps dashboard is desirable, not mandatory.", evidence: doc.isSla ? `§4: "aggregate liability shall not exceed the total fees paid in the twelve (12) months…" (anchor c922)` : `§3: "Vendors SHOULD offer a FinOps dashboard with per-team cost allocation…" (anchor c782)`, confidence: "high" },
        { finding: "Evaluation weighting is 40/30/20/10 across technical, price, support, references.", evidence: `§5 scoring rubric (anchor c1022).`, confidence: "medium" },
      ],
      recommendation: doc.isSla
        ? "Accept v2, but have legal confirm the 12-month liability cap is adequate for the contract value."
        : "Submit as compliant on §2/§4; label the FinOps dashboard as 'committed, Q3' to avoid an overstated claim.",
    };
    ev.push({ type: "report", id: nid("report"), report });
  }

  return { ev, report };
}

// short follow-up trace (2nd assistant)
function followupEvents(nid, c, isDoc, doc) {
  const ev = [];
  ev.push({ type: "status", status: "running" });
  const planId = nid("plan");
  ev.push({ type: "plan_start", id: planId });
  if (isDoc) {
    ev.push({ type: "plan_delta", id: planId, delta: doc.answer });
    ev.push({ type: "plan_end", id: planId });
    const a = doc.cites[0];
    ev.push({ type: "cite", id: nid("cite"), anchor: a, quote: RFP_CLAUSES[a].quote, section: RFP_CLAUSES[a].section });
  } else {
    const g = c.groups;
    const two = g.slice(0, 2);
    const delta = `Drilling in: **${two[0].name}** and **${two[1].name}** together account for the bulk of it — ${two.map((x) => x.name).join(" and ")} are where the movement is. Everything below ${g[2].name} is comparatively flat.`;
    ev.push({ type: "plan_delta", id: planId, delta });
    ev.push({ type: "plan_end", id: planId });
    ev.push({ type: "code", id: nid("code"), stepDescription: "drill into the top segments", code: `top = g.sort_values(ascending=False).head(3)\nprint(top)\nprint('share:', round(top.sum()/g.sum()*100,1), '%')` });
    ev.push({ type: "execution", id: nid("exec"), output: c.execOut.split("\n").slice(0, 4).join("\n") + `\nshare: ${(Math.round(((g[0].value + g[1].value + g[2].value) / g.reduce((s, x) => s + x.value, 0)) * 1000) / 10)} %`, isError: false });
  }
  ev.push({ type: "usage", inputTokens: 900, outputTokens: 240 });
  ev.push({ type: "status", status: "done" });
  return ev;
}

// ---- main loop --------------------------------------------------------------
const out = [];
const linked = { prospects: 0, cloud: 0, rfp: 0 };
let msgCount = 0;
let bespokeUsed = 0;
const BESPOKE_MAX = 14;
const usageFor = (intent) =>
  intent === "decision"
    ? { inputTokens: rint(mkRng("u"), 3200, 5200), outputTokens: rint(mkRng("v"), 900, 1600) }
    : intent === "analytical"
    ? { inputTokens: 2100, outputTokens: 620 }
    : { inputTokens: 1400, outputTokens: 380 };

for (const conv of convs) {
  const nid = eventIdFactory(conv.conv);
  const msgs = conv.msgs || [];
  const firstAsst = msgs.find((m) => m.role === "ASSISTANT");
  if (!firstAsst) continue;
  const isDoc = firstAsst.modality === "document";
  const cfg = TITLE_CFG[conv.title] || { ds: "cloud", dim: "Lead_Source", names: CLOUD_SOURCES, kind: "revenue", chart: "bar" };

  // choose grounding source + link it
  let srcKey;
  if (isDoc) srcKey = "rfp";
  else srcKey = cfg.ds;
  const src = SRC[srcKey];
  out.push(
    `INSERT INTO "ConversationSource" ("conversationId","sourceId","versionId","alias") VALUES (${sqlText(conv.conv)}, ${sqlText(src.sourceId)}, ${sqlText(src.versionId)}, ${sqlText(src.alias)}) ON CONFLICT DO NOTHING;`,
  );
  linked[srcKey]++;

  // build primary content once (shared by follow-up drill-down)
  const tab = isDoc ? null : buildTabular(conv.conv, cfg, conv.title);
  const doc = isDoc ? buildDocument(conv.conv, conv.title, firstAsst.intent) : null;

  // decide bespoke: richest decision runs, capped
  let asstSeen = 0;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === "USER") {
      // rewrite the FIRST user question to a natural one; leave follow-ups as-is
      if (i === 0 && QUESTION[conv.title]) {
        out.push(`UPDATE "Message" SET content=${sqlText(QUESTION[conv.title])} WHERE id=${sqlText(m.id)} AND left(id,5)='seed_';`);
      }
      continue;
    }
    // ASSISTANT
    asstSeen++;
    const isFirstAsst = asstSeen === 1;
    let ev, report;

    if (isFirstAsst) {
      const wantBespoke = m.intent === "decision" && bespokeUsed < BESPOKE_MAX;
      if (wantBespoke) bespokeUsed++;
      if (isDoc) {
        ({ ev, report } = documentEvents(nid, doc, m.intent, wantBespoke));
      } else {
        ({ ev, report } = tabularEvents(nid, tab, m.intent, wantBespoke, false));
      }
      // settle: suggestions + usage + done
      const sugg = suggestionsFor(conv.title, m.intent);
      ev.push({ type: "suggestions", id: nid("sugg"), items: sugg });
      const u = usageFor(m.intent);
      ev.push({ type: "usage", inputTokens: u.inputTokens, outputTokens: u.outputTokens });
      ev.push({ type: "status", status: "done" });

      const reportSql = report ? sqlStr(report) + "::jsonb" : "NULL";
      out.push(
        `UPDATE "Message" SET events=${sqlStr(ev)}::jsonb, report=${reportSql}, suggestions=${sqlStr(sugg)}::jsonb, "inputTokens"=${u.inputTokens}, "outputTokens"=${u.outputTokens}, status='DONE' WHERE id=${sqlText(m.id)} AND left(id,5)='seed_';`,
      );
      msgCount++;
    } else {
      // follow-up assistant: short trace, no report, small suggestions
      ev = followupEvents(nid, tab, isDoc, doc);
      const sugg = suggestionsFor(conv.title, "quick_fact").slice(0, 2);
      // splice suggestions before final status
      ev.splice(ev.length - 1, 0, { type: "suggestions", id: nid("sugg"), items: sugg });
      out.push(
        `UPDATE "Message" SET events=${sqlStr(ev)}::jsonb, report=NULL, suggestions=${sqlStr(sugg)}::jsonb, "inputTokens"=900, "outputTokens"=240, status='DONE' WHERE id=${sqlText(m.id)} AND left(id,5)='seed_';`,
      );
      msgCount++;
    }
  }
}

const sql = ["BEGIN;", ...out, "COMMIT;"].join("\n") + "\n";
writeFileSync(join(SCRATCH, "traces.sql"), sql);
console.error(
  `messages=${msgCount} bespoke=${bespokeUsed} linked=${JSON.stringify(linked)} statements=${out.length}`,
);
