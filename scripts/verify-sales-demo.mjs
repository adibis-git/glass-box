// Statistically verifies every story embedded by gen-sales-demo.mjs actually
// emerged in the generated CSVs — the same discipline used earlier for the
// messy-CSV normalizer and the large-file sampler. Run after regenerating.
//
// Run: node scripts/verify-sales-demo.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", ".tmp-fixtures");

function load(name) {
  const text = readFileSync(join(DIR, name), "utf8");
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

const reps = load("sales_team.csv");
const prospects = load("sales_prospects.csv");
const meetings = load("sales_meetings.csv");

const repById = new Map(reps.map((r) => [r.rep_id, r]));
let failures = 0;
function check(label, cond, detail) {
  const mark = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`[${mark}] ${label}${detail ? " — " + detail : ""}`);
}

function winRate(rows) {
  const resolved = rows.filter((p) => p.status === "Won" || p.status === "Lost" || p.status === "Dead");
  const won = resolved.filter((p) => p.status === "Won").length;
  return resolved.length ? won / resolved.length : 0;
}

console.log(`\n=== Volume: ${reps.length} reps, ${prospects.length} prospects, ${meetings.length} meetings ===\n`);

// ---- Story 1: lead-source quality inversion ----
console.log("--- Story 1: Lead-source volume vs conversion ---");
const bySource = {};
for (const p of prospects) (bySource[p.lead_source] ??= []).push(p);
const sourceStats = Object.entries(bySource)
  .map(([src, rows]) => ({ src, n: rows.length, wr: winRate(rows) }))
  .sort((a, b) => b.n - a.n);
for (const s of sourceStats) {
  console.log(`  ${s.src.padEnd(16)} n=${String(s.n).padStart(4)}  win_rate=${(s.wr * 100).toFixed(1)}%`);
}
const paidMkt = sourceStats.find((s) => s.src === "Paid Marketing");
const referral = sourceStats.find((s) => s.src === "Referral");
check(
  "Paid Marketing is top-3 volume but bottom-2 win rate",
  sourceStats.indexOf(paidMkt) < 3 && sourceStats.slice().sort((a, b) => a.wr - b.wr).indexOf(paidMkt) < 2,
);
check(
  "Referral is lowest/near-lowest volume but highest win rate",
  sourceStats.slice().sort((a, b) => b.wr - a.wr)[0].src === "Referral" &&
    sourceStats.slice().sort((a, b) => a.n - b.n).indexOf(referral) < 2,
);
check("Referral win rate > 2x Paid Marketing win rate", referral.wr > paidMkt.wr * 2, `${(referral.wr*100).toFixed(1)}% vs ${(paidMkt.wr*100).toFixed(1)}%`);

// ---- Story 2: ramp effect (tenure) ----
console.log("\n--- Story 2: Ramp effect (rep tenure at period end) ---");
const bucket = (t) => (t < 6 ? "new(<6mo)" : t <= 24 ? "core(6-24mo)" : "senior(24mo+)");
const byTenure = {};
for (const p of prospects) {
  const rep = repById.get(p.rep_id);
  if (!rep) continue;
  const b = bucket(Number(rep.tenure_months));
  (byTenure[b] ??= []).push(p);
}
const tenureStats = {};
for (const [b, rows] of Object.entries(byTenure)) {
  const dead = rows.filter((p) => p.status === "Dead").length;
  const resolved = rows.filter((p) => ["Won", "Lost", "Dead"].includes(p.status)).length;
  tenureStats[b] = { n: rows.length, wr: winRate(rows), deadRate: resolved ? dead / resolved : 0 };
  console.log(`  ${b.padEnd(14)} n=${rows.length}  win_rate=${(tenureStats[b].wr*100).toFixed(1)}%  dead_rate=${(tenureStats[b].deadRate*100).toFixed(1)}%`);
}
check(
  "New reps (<6mo) win rate is clearly below core reps",
  tenureStats["new(<6mo)"].wr < tenureStats["core(6-24mo)"].wr * 0.75,
);
check(
  "New reps (<6mo) dead rate is clearly above core reps",
  tenureStats["new(<6mo)"].deadRate > tenureStats["core(6-24mo)"].deadRate * 1.2,
);

// ---- Story 3: LATAM declining ----
console.log("\n--- Story 3: Region x quarter win rate ---");
const quarters = ["Q4 2025", "Q1 2026", "Q2 2026"];
const regions = ["North America", "EMEA", "APAC", "LATAM"];
const regionQuarterWr = {};
for (const region of regions) {
  regionQuarterWr[region] = quarters.map((q) => {
    const rows = prospects.filter((p) => {
      const rep = repById.get(p.rep_id);
      return rep && rep.region === region && p.quarter === q;
    });
    return winRate(rows);
  });
  console.log(`  ${region.padEnd(16)} ${regionQuarterWr[region].map((w) => (w * 100).toFixed(1) + "%").join("  ->  ")}`);
}
const latam = regionQuarterWr["LATAM"];
check("LATAM win rate declines Q4->Q1->Q2", latam[0] > latam[1] && latam[1] > latam[2]);
check(
  "LATAM Q2 win rate is well below its Q4 win rate",
  latam[2] < latam[0] * 0.75,
  `${(latam[2]*100).toFixed(1)}% vs ${(latam[0]*100).toFixed(1)}%`,
);
// Compare relative change Q4->Q2, not raw non-decline: single-seed sampling
// noise on ~15% win rates over ~800-1000 rows/quarter can easily produce a
// wobble of a percentage point either way for a region designed to be "flat".
// The real story is CONTRAST — LATAM's collapse should dwarf any other
// region's movement, not that every other region is perfectly monotonic.
const relChange = (arr) => (arr[2] - arr[0]) / arr[0];
const latamRelChange = relChange(latam);
for (const region of ["North America", "EMEA", "APAC"]) {
  const rc = relChange(regionQuarterWr[region]);
  check(
    `${region} relative change is much smaller than LATAM's collapse`,
    Math.abs(rc) < Math.abs(latamRelChange) / 2,
    `${region} ${(rc * 100).toFixed(1)}% vs LATAM ${(latamRelChange * 100).toFixed(1)}%`,
  );
}

// ---- Story 3b: LATAM pipeline volume also shrinking ----
console.log("\n--- Story 3b: Region x quarter prospect volume ---");
for (const region of regions) {
  const counts = quarters.map(
    (q) => prospects.filter((p) => { const rep = repById.get(p.rep_id); return rep && rep.region === region && p.quarter === q; }).length,
  );
  console.log(`  ${region.padEnd(16)} ${counts.join("  ->  ")}`);
  if (region === "LATAM") {
    check("LATAM prospect volume declines Q4->Q2", counts[0] > counts[2]);
  }
}

// ---- Story 4: AI Platform surge ----
console.log("\n--- Story 4: Product mix by quarter ---");
const productShare = {};
for (const q of quarters) {
  const rows = prospects.filter((p) => p.quarter === q);
  const aiShare = rows.filter((p) => p.product_interest === "AI Platform").length / rows.length;
  productShare[q] = aiShare;
  console.log(`  ${q}: AI Platform share = ${(aiShare * 100).toFixed(1)}%`);
}
check(
  "AI Platform share roughly triples from Q4'25 to Q2'26",
  productShare["Q2 2026"] > productShare["Q4 2025"] * 2,
);

// ---- Story 5: segment tradeoff ----
console.log("\n--- Story 5: Segment win rate vs average deal size ---");
for (const seg of ["Enterprise", "Mid-Market", "SMB"]) {
  const rows = prospects.filter((p) => { const rep = repById.get(p.rep_id); return rep && rep.segment === seg; });
  const won = rows.filter((p) => p.status === "Won");
  const avgDeal = won.length ? won.reduce((a, p) => a + Number(p.closed_value_usd), 0) / won.length : 0;
  console.log(`  ${seg.padEnd(12)} win_rate=${(winRate(rows) * 100).toFixed(1)}%  avg_deal=$${avgDeal.toFixed(0)}`);
}
const smbRows = prospects.filter((p) => { const rep = repById.get(p.rep_id); return rep && rep.segment === "SMB"; });
const entRows = prospects.filter((p) => { const rep = repById.get(p.rep_id); return rep && rep.segment === "Enterprise"; });
check("SMB win rate > Enterprise win rate", winRate(smbRows) > winRate(entRows));
const smbAvg = (() => { const w = smbRows.filter(p=>p.status==="Won"); return w.reduce((a,p)=>a+Number(p.closed_value_usd),0)/w.length; })();
const entAvg = (() => { const w = entRows.filter(p=>p.status==="Won"); return w.reduce((a,p)=>a+Number(p.closed_value_usd),0)/w.length; })();
check("Enterprise avg deal size > 3x SMB avg deal size", entAvg > smbAvg * 3, `$${entAvg.toFixed(0)} vs $${smbAvg.toFixed(0)}`);

// ---- Story 6: revenue concentration ----
console.log("\n--- Story 6: Revenue concentration across reps ---");
const revByRep = new Map();
for (const p of prospects) {
  if (p.status !== "Won") continue;
  revByRep.set(p.rep_id, (revByRep.get(p.rep_id) ?? 0) + Number(p.closed_value_usd));
}
const revList = reps.map((rp) => revByRep.get(rp.rep_id) ?? 0).sort((a, b) => b - a);
const totalRev = revList.reduce((a, b) => a + b, 0);
const top15Count = Math.round(reps.length * 0.15);
const top15Rev = revList.slice(0, top15Count).reduce((a, b) => a + b, 0);
const top15Share = top15Rev / totalRev;
console.log(`  Total closed revenue: $${totalRev.toLocaleString("en-US")}`);
console.log(`  Top ${top15Count} reps (15%) share of revenue: ${(top15Share * 100).toFixed(1)}%`);
check("Top 15% of reps carry a disproportionate (>30%) revenue share", top15Share > 0.3);

// ---- Story: dead prospects had almost no follow-up ----
console.log("\n--- Sanity: dead prospects had minimal engagement ---");
const deadRows = prospects.filter((p) => p.status === "Dead");
const avgDeadMeetings = deadRows.reduce((a, p) => a + Number(p.meetings_held), 0) / deadRows.length;
console.log(`  Dead prospects: n=${deadRows.length}, avg meetings_held=${avgDeadMeetings.toFixed(2)}`);
check("Dead prospects average well under 1 meeting", avgDeadMeetings < 0.6);

// ---- Cross-file integrity ----
console.log("\n--- Cross-file integrity ---");
const meetingCountByProspect = new Map();
for (const m of meetings) meetingCountByProspect.set(m.prospect_id, (meetingCountByProspect.get(m.prospect_id) ?? 0) + 1);
let mismatches = 0;
for (const p of prospects) {
  const actual = meetingCountByProspect.get(p.prospect_id) ?? 0;
  if (actual !== Number(p.meetings_held)) mismatches++;
}
check("meetings.csv row counts match prospects.meetings_held exactly", mismatches === 0, `${mismatches} mismatches`);
const allRepIdsValid = prospects.every((p) => repById.has(p.rep_id)) && meetings.every((m) => repById.has(m.rep_id));
check("Every rep_id in prospects/meetings exists in sales_team", allRepIdsValid);

console.log(`\n${failures === 0 ? "ALL CHECKS PASS" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
