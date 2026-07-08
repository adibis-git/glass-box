// Generates a 3-table synthetic Cloud Sales demo: a 110-person sales org,
// ~8,000 prospects, and their meeting history across the last 3 completed
// quarters (2025-10-01 .. 2026-06-30). Deterministic (seeded) so the stories
// below are reproducible.
//
// Deliberately embedded, verifiable stories (see scripts/verify-sales-demo.mjs):
//   1. Lead-source quality inversion — Paid Marketing / Cold Outreach drive the
//      most volume but convert worst; Referral / Conference are rare but convert best.
//   2. Ramp effect — reps with <6 months tenure convert less and let more
//      prospects go dead (no follow-up) than tenured reps.
//   3. LATAM is declining quarter over quarter (both volume and win rate)
//      while other regions hold flat or grow.
//   4. AI Platform surges as a share of pipeline: ~10% -> ~18% -> ~30%.
//   5. Segment tradeoff — SMB converts most often but smallest deals;
//      Enterprise converts least often but each win is huge.
//   6. Revenue concentration — a skill-variance model naturally produces a
//      Pareto-ish split (top ~15% of reps carry a disproportionate revenue share).
//
// Run: node scripts/gen-sales-demo.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", ".tmp-fixtures");
mkdirSync(OUT, { recursive: true });

// ---- seeded RNG (mulberry32) ----
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(20260708);
const pick = (arr) => arr[Math.floor(r() * arr.length)];
const wpick = (arr, weights) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < arr.length; i++) {
    if ((x -= weights[i]) <= 0) return arr[i];
  }
  return arr[arr.length - 1];
};
const randint = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const uniform = (lo, hi) => lo + r() * (hi - lo);
// Box-Muller standard normal.
function randNormal() {
  const u1 = Math.max(r(), 1e-9);
  const u2 = r();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function clip(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ---- date helpers (window: 2025-10-01 .. 2026-06-30, 9 months) ----
const PERIOD_START = new Date("2025-10-01T00:00:00Z");
const PERIOD_END = new Date("2026-06-30T00:00:00Z");
const MONTHS = 9; // Oct..Jun

function monthStart(m) {
  const d = new Date(PERIOD_START);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d;
}
function daysInMonth(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}
function randomDayInMonth(m) {
  const start = monthStart(m);
  const day = randint(1, daysInMonth(start));
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
}
function addDays(d, days) {
  const nd = new Date(d);
  nd.setUTCDate(nd.getUTCDate() + Math.round(days));
  return nd;
}
function fmt(d) {
  return d.toISOString().slice(0, 10);
}
function monthDiff(a, b) {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}
function quarterLabel(m) {
  // m=0..2 -> Q4 2025, m=3..5 -> Q1 2026, m=6..8 -> Q2 2026
  if (m < 3) return "Q4 2025";
  if (m < 6) return "Q1 2026";
  return "Q2 2026";
}
function quarterIndex(m) {
  return Math.floor(m / 3); // 0,1,2
}

// ---- CSV writer (RFC-4180) ----
function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => esc(row[h])).join(","));
  return lines.join("\n") + "\n";
}

// ============================================================
// 1) SALES TEAM (110 reps, 9 managers nested by region)
// ============================================================
const REGIONS = ["North America", "EMEA", "APAC", "LATAM"];
const REGION_REP_COUNT = { "North America": 38, EMEA: 33, APAC: 22, LATAM: 17 }; // 110 total
const REGION_MANAGERS = {
  "North America": ["Grace Whitfield", "Marcus Chen", "Priya Nair"],
  EMEA: ["Oliver Bennett", "Sofia Marchetti", "Klaus Richter"],
  APAC: ["Wei Tanaka", "Ananya Rao"],
  LATAM: ["Diego Fonseca"],
};
const SEGMENTS = ["Enterprise", "Mid-Market", "SMB"];
const SEGMENT_WEIGHTS = [25, 45, 30];
const SEGMENT_QUOTA = {
  Enterprise: [150000, 250000],
  "Mid-Market": [60000, 100000],
  SMB: [25000, 45000],
};
const SEGMENT_VOLUME_WEIGHT = { Enterprise: 0.6, "Mid-Market": 1.0, SMB: 1.5 };
const SEGMENT_WIN_MULT = { Enterprise: 0.85, "Mid-Market": 1.0, SMB: 1.15 };
const SEGMENT_SIZE_BANDS = {
  Enterprise: [
    ["1000-5000", 55],
    ["5000+", 35],
    ["201-1000", 10],
  ],
  "Mid-Market": [
    ["201-1000", 55],
    ["51-200", 25],
    ["1000-5000", 20],
  ],
  SMB: [
    ["1-50", 55],
    ["51-200", 35],
    ["201-1000", 10],
  ],
};
const SEGMENT_WON_MEETINGS = { Enterprise: [4, 8], "Mid-Market": [3, 6], SMB: [2, 4] };
const SEGMENT_CYCLE_DAYS = { Enterprise: [30, 90], "Mid-Market": [15, 50], SMB: [7, 25] };

const FIRST_NAMES = [
  "James", "Maria", "Liam", "Aisha", "Noah", "Yuki", "Ethan", "Fatima", "Lucas", "Chen",
  "Olivia", "Raj", "Emma", "Kenji", "Ava", "Priya", "Mason", "Sofia", "Arjun", "Nina",
  "Daniel", "Mei", "Sophia", "Carlos", "Isabella", "Hiroshi", "Mia", "Diego", "Lena", "Omar",
  "Grace", "Felix", "Amara", "Ravi", "Clara", "Kwame", "Elena", "Sanjay", "Ines", "Tomas",
];
const LAST_NAMES = [
  "Bennett", "Rodriguez", "Nakamura", "Khan", "Whitfield", "Silva", "Fonseca", "Marchetti",
  "Richter", "Nair", "Chen", "Tanaka", "Rao", "Osei", "Novak", "Alvarez", "Weber", "Larsson",
  "Costa", "Ibrahim", "Petrov", "Yamamoto", "Singh", "Dubois", "Kovac", "Mendes", "Haddad",
  "Okafor", "Lindgren", "Suzuki",
];

const reps = [];
let repSeq = 1;
for (const region of REGIONS) {
  const managers = REGION_MANAGERS[region];
  for (let i = 0; i < REGION_REP_COUNT[region]; i++) {
    const segment = wpick(SEGMENTS, SEGMENT_WEIGHTS);
    // Tenure mixture: 15% <6mo, 55% 6-24mo, 30% 24mo+ (months, as of period end)
    const tenureRoll = r();
    let tenureMonths;
    if (tenureRoll < 0.15) tenureMonths = randint(1, 5);
    else if (tenureRoll < 0.7) tenureMonths = randint(6, 24);
    else tenureMonths = randint(25, 60);

    const hireDate = new Date(PERIOD_END);
    hireDate.setUTCDate(hireDate.getUTCDate() - Math.round(tenureMonths * 30.44));

    const [qLo, qHi] = SEGMENT_QUOTA[segment];
    const quota = Math.round(uniform(qLo, qHi) / 1000) * 1000;

    // Skill multiplier: lognormal-ish, clipped. Drives natural revenue concentration.
    const skill = clip(Math.exp(randNormal() * 0.4), 0.4, 2.2);

    reps.push({
      rep_id: `REP-${String(repSeq).padStart(4, "0")}`,
      rep_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      region,
      segment,
      manager_name: pick(managers),
      hire_date: fmt(hireDate),
      tenure_months: tenureMonths,
      monthly_quota_usd: quota,
      _skill: skill, // internal only — not written to CSV
    });
    repSeq++;
  }
}

// ============================================================
// 2) PROSPECTS (~8,000)
// ============================================================
const LEAD_SOURCES = [
  ["Paid Marketing", 26, 0.08],
  ["Cold Outreach", 18, 0.11],
  ["Website Inquiry", 16, 0.17],
  ["LinkedIn", 15, 0.2],
  ["Inbound Call", 12, 0.27],
  ["Conference", 8, 0.33],
  ["Referral", 5, 0.42],
];
const SOURCE_NAMES = LEAD_SOURCES.map((s) => s[0]);
const SOURCE_VOLUME_W = LEAD_SOURCES.map((s) => s[1]);
const SOURCE_WIN_RATE = Object.fromEntries(LEAD_SOURCES.map((s) => [s[0], s[2]]));

const PRODUCTS = ["Cloud Compute", "Cloud Storage", "Data Analytics", "Security Suite", "AI Platform"];
// Quarter-indexed weights (q=0 Q4'25, q=1 Q1'26, q=2 Q2'26) — AI Platform surges.
const PRODUCT_WEIGHTS_BY_Q = [
  [30, 25, 20, 15, 10],
  [27, 22, 18, 15, 18],
  [22, 18, 15, 15, 30],
];
const PRODUCT_BASE_VALUE = {
  "Cloud Storage": [8000, 20000],
  "Cloud Compute": [15000, 40000],
  "Data Analytics": [20000, 55000],
  "Security Suite": [30000, 90000],
  "AI Platform": [40000, 140000],
};
const SIZE_VALUE_MULT = { "1-50": 0.4, "51-200": 0.7, "201-1000": 1.0, "1000-5000": 1.6, "5000+": 2.6 };

// Region x quarter win-rate multiplier — LATAM declines, others flat/growing.
const REGION_QUARTER_MULT = {
  "North America": [1.0, 1.05, 1.12],
  EMEA: [1.0, 1.04, 1.1],
  APAC: [1.0, 1.02, 0.98],
  LATAM: [1.15, 0.95, 0.7],
};
// Region x quarter PROSPECT VOLUME multiplier — LATAM pipeline shrinks too.
const REGION_QUARTER_VOLUME_MULT = {
  "North America": [1.0, 1.05, 1.1],
  EMEA: [1.0, 1.03, 1.08],
  APAC: [1.0, 1.0, 1.02],
  LATAM: [1.0, 0.85, 0.65],
};

const COMPANY_PREFIX = [
  "Nimbus", "Vertex", "Quantum", "Orbit", "Atlas", "Helix", "Zenith", "Fusion", "Apex", "Nova",
  "Cobalt", "Lattice", "Meridian", "Vantage", "Ember", "Sterling", "Beacon", "Catalyst", "Drift",
  "Anchor", "Summit", "Horizon", "Pulse", "Granite", "Solace", "Ridgeline", "Wavefront", "Northgate",
  "Ironclad", "Redshift",
];
const COMPANY_SUFFIX = [
  "Systems", "Dynamics", "Works", "Labs", "Group", "Solutions", "Networks", "Industries",
  "Holdings", "Technologies", "Partners", "Digital",
];

// Company activity gate: a rep can only generate prospects in months they've
// already been hired for.
function repActiveInMonth(rep, m) {
  const hire = new Date(rep.hire_date + "T00:00:00Z");
  return monthDiff(hire, monthStart(m)) >= 0;
}

// Precompute overall month weight (company growth trend, 1.0x -> 1.35x).
const monthWeight = (m) => 1.0 + 0.35 * (m / (MONTHS - 1));

const prospects = [];
const meetings = [];
let prospectSeq = 1;
let meetingSeq = 1;
const N_PROSPECTS = 8000;
const CUTOFF_DATE = addDays(PERIOD_END, -35); // prospects created after this: mostly still Open

for (let i = 0; i < N_PROSPECTS; i++) {
  // 1. pick month, weighted by overall company growth trend
  const monthWeights = Array.from({ length: MONTHS }, (_, m) => monthWeight(m));
  const m = Number(wpick(Array.from({ length: MONTHS }, (_, k) => k), monthWeights));
  const q = quarterIndex(m);

  // 2. pick a rep active in that month, weighted by segment volume x region-quarter volume
  const activeReps = reps.filter((rp) => repActiveInMonth(rp, m));
  const repWeights = activeReps.map(
    (rp) => SEGMENT_VOLUME_WEIGHT[rp.segment] * REGION_QUARTER_VOLUME_MULT[rp.region][q],
  );
  const rep = wpick(activeReps, repWeights);

  const createdDate = randomDayInMonth(m);
  const leadSource = wpick(SOURCE_NAMES, SOURCE_VOLUME_W);
  const product = wpick(PRODUCTS, PRODUCT_WEIGHTS_BY_Q[q]);
  const sizeBand = wpick(
    SEGMENT_SIZE_BANDS[rep.segment].map((b) => b[0]),
    SEGMENT_SIZE_BANDS[rep.segment].map((b) => b[1]),
  );

  // Deal value
  const [bLo, bHi] = PRODUCT_BASE_VALUE[product];
  const baseValue = uniform(bLo, bHi);
  const skillValueMult = 0.7 + 0.3 * rep._skill;
  const proposedValue = Math.round(
    (baseValue * SIZE_VALUE_MULT[sizeBand] * skillValueMult * uniform(0.85, 1.15)) / 100,
  ) * 100;

  // Tenure ramp effect (as of the month the prospect was created, not period end)
  const tenureAtCreation = monthDiff(new Date(rep.hire_date + "T00:00:00Z"), createdDate);
  const isRamping = tenureAtCreation < 6;
  const tenureWinMult = isRamping ? 0.55 : tenureAtCreation >= 25 ? 1.12 : 1.0;
  const tenureDeadMult = isRamping ? 1.6 : 1.0;

  const isTooNew = createdDate > CUTOFF_DATE;

  let status, meetingsHeld, closedDate, closedValue;

  if (isTooNew && r() < 0.8) {
    status = "Open";
    meetingsHeld = Number(wpick([0, 1, 2, 3], [35, 35, 20, 10]));
    closedDate = "";
    closedValue = "";
  } else {
    const deadProb = clip(0.3 * tenureDeadMult, 0.05, 0.6);
    if (r() < deadProb) {
      status = "Dead";
      meetingsHeld = Number(wpick([0, 1, 2], [70, 25, 5]));
      closedDate = "";
      closedValue = "";
    } else {
      const pWin = clip(
        SOURCE_WIN_RATE[leadSource] *
          tenureWinMult *
          REGION_QUARTER_MULT[rep.region][q] *
          rep._skill *
          SEGMENT_WIN_MULT[rep.segment],
        0.02,
        0.85,
      );
      const won = r() < pWin;
      const [cLo, cHi] = SEGMENT_CYCLE_DAYS[rep.segment];
      let cd = addDays(createdDate, randint(cLo, cHi));
      if (cd > PERIOD_END) cd = addDays(PERIOD_END, -randint(0, 3));
      closedDate = fmt(cd);
      if (won) {
        status = "Won";
        const [wLo, wHi] = SEGMENT_WON_MEETINGS[rep.segment];
        meetingsHeld = randint(wLo, wHi);
        closedValue = Math.round((proposedValue * uniform(0.85, 1.2)) / 100) * 100;
      } else {
        status = "Lost";
        meetingsHeld = randint(2, 5);
        closedValue = "";
      }
    }
  }

  const prospectId = `PROS-${String(prospectSeq).padStart(5, "0")}`;
  prospects.push({
    prospect_id: prospectId,
    rep_id: rep.rep_id,
    company_name: `${pick(COMPANY_PREFIX)} ${pick(COMPANY_SUFFIX)}`,
    company_size: sizeBand,
    lead_source: leadSource,
    product_interest: product,
    quarter: quarterLabel(m),
    created_date: fmt(createdDate),
    status,
    meetings_held: meetingsHeld,
    closed_date: closedDate,
    proposed_value_usd: proposedValue,
    closed_value_usd: closedValue,
  });
  prospectSeq++;

  // ---- meetings ----
  if (meetingsHeld > 0) {
    let boundEnd;
    if (status === "Dead") {
      boundEnd = addDays(createdDate, randint(3, 20)); // quick abandonment
    } else if (status === "Won" || status === "Lost") {
      boundEnd = new Date(closedDate + "T00:00:00Z");
    } else {
      boundEnd = PERIOD_END; // Open — meetings continue up to "now"
    }
    const firstMeeting = addDays(createdDate, randint(2, 10));
    const span = Math.max(1, monthDiffDays(firstMeeting, boundEnd));
    const MEETING_TYPES = [
      "Discovery Call", "Demo", "Technical Deep Dive", "Negotiation", "Check-in", "Check-in",
    ];
    for (let mi = 1; mi <= meetingsHeld; mi++) {
      const frac = meetingsHeld === 1 ? 0 : (mi - 1) / (meetingsHeld - 1);
      const jitter = randint(-2, 2);
      const meetingDate = addDays(firstMeeting, frac * span + jitter);
      const clamped = meetingDate < createdDate ? createdDate : meetingDate > boundEnd ? boundEnd : meetingDate;
      meetings.push({
        meeting_id: `MTG-${String(meetingSeq).padStart(6, "0")}`,
        prospect_id: prospectId,
        rep_id: rep.rep_id,
        meeting_number: mi,
        meeting_date: fmt(clamped),
        meeting_type: MEETING_TYPES[Math.min(mi - 1, MEETING_TYPES.length - 1)],
      });
      meetingSeq++;
    }
  }
}

function monthDiffDays(a, b) {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000));
}

// ---- write outputs (drop internal-only fields) ----
const repRows = reps.map(({ _skill, ...rest }) => rest);

writeFileSync(
  join(OUT, "sales_team.csv"),
  toCsv(
    ["rep_id", "rep_name", "region", "segment", "manager_name", "hire_date", "tenure_months", "monthly_quota_usd"],
    repRows,
  ),
);
writeFileSync(
  join(OUT, "sales_prospects.csv"),
  toCsv(
    [
      "prospect_id", "rep_id", "company_name", "company_size", "lead_source", "product_interest",
      "quarter", "created_date", "status", "meetings_held", "closed_date", "proposed_value_usd",
      "closed_value_usd",
    ],
    prospects,
  ),
);
writeFileSync(
  join(OUT, "sales_meetings.csv"),
  toCsv(["meeting_id", "prospect_id", "rep_id", "meeting_number", "meeting_date", "meeting_type"], meetings),
);

console.log(`Wrote ${reps.length} reps, ${prospects.length} prospects, ${meetings.length} meetings to .tmp-fixtures/`);
