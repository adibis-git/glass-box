// Generates the three bundled demo datasets into public/samples/.
// Deterministic (seeded) so the data is stable across builds and demos.
//
// Run: node scripts/gen-samples.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "samples");
mkdirSync(OUT, { recursive: true });

// --- deterministic RNG (mulberry32) ---
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
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const wpick = (r, arr, weights) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < arr.length; i++) {
    if ((x -= weights[i]) <= 0) return arr[i];
  }
  return arr[arr.length - 1];
};
const randint = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

// --- CSV writer (RFC-4180 quoting) ---
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
// 1) Indian startup funding (~500 rows)
//    amount_usd is intentionally a "$1,234,567" STRING — realistic for scraped
//    funding data, and a natural trigger for the agent's self-correction.
// ============================================================
function startupFunding() {
  const r = rng(101);
  const sectors = [
    "Fintech", "SaaS", "E-commerce", "Edtech", "Healthtech",
    "Logistics", "AI/ML", "Foodtech", "Gaming", "Cleantech",
  ];
  const cities = [
    "Bengaluru", "Mumbai", "Delhi NCR", "Hyderabad", "Pune", "Chennai", "Gurugram", "Noida",
  ];
  const rounds = ["Seed", "Pre-Series A", "Series A", "Series B", "Series C", "Series D"];
  const roundBase = {
    Seed: 1_000_000, "Pre-Series A": 3_000_000, "Series A": 10_000_000,
    "Series B": 30_000_000, "Series C": 70_000_000, "Series D": 150_000_000,
  };
  const pre = ["Cred", "Zeno", "Kite", "Nova", "Byte", "Loop", "Vault", "Orbit", "Peak", "Flux",
    "Sarv", "Meta", "Uni", "Prime", "Cash", "Shop", "Learn", "Care", "Ship", "Play"];
  const suf = ["pay", "kart", "ly", "flow", "base", "wave", "labs", "AI", "grid", "works", "hub", "mint"];

  // Sector popularity shifts over years — AI/ML surges late, Fintech stays strong.
  const sectorWeightByYear = {
    2019: [10, 8, 12, 7, 5, 6, 2, 5, 4, 3],
    2020: [11, 9, 11, 8, 7, 6, 3, 5, 4, 3],
    2021: [13, 11, 10, 7, 8, 7, 5, 5, 5, 4],
    2022: [12, 11, 8, 6, 9, 7, 8, 4, 4, 5],
    2023: [12, 12, 7, 5, 10, 6, 14, 4, 3, 6],
    2024: [11, 12, 6, 4, 11, 6, 20, 3, 3, 7],
  };
  const years = [2019, 2020, 2021, 2022, 2023, 2024];

  const rows = [];
  const n = 500;
  for (let i = 0; i < n; i++) {
    const year = wpick(r, years, [12, 14, 20, 20, 18, 16]);
    const sector = wpick(r, sectors, sectorWeightByYear[year]);
    const round = wpick(r, rounds, [26, 22, 20, 16, 10, 6]);
    const city = wpick(r, cities, [30, 20, 16, 12, 8, 6, 5, 3]);

    // Amount: base * round, with sector + late-year multipliers and noise.
    let amt = roundBase[round];
    const yearBoost = 1 + (year - 2019) * 0.08;
    const sectorBoost = sector === "AI/ML" ? 1.4 : sector === "Fintech" ? 1.25 : 1;
    amt = amt * yearBoost * sectorBoost * (0.6 + r() * 0.9);
    amt = Math.round(amt / 50_000) * 50_000;

    const name = pre[randint(r, 0, pre.length - 1)] + pick(r, suf);
    rows.push({
      startup: name,
      sector,
      city,
      round,
      amount_usd: "$" + amt.toLocaleString("en-US"),
      year,
    });
  }
  return toCsv(["startup", "sector", "city", "round", "amount_usd", "year"], rows);
}

// ============================================================
// 2) E-commerce sales (~1000 rows) — clean numerics, trend + returns signal
// ============================================================
function ecommerceSales() {
  const r = rng(202);
  const categories = ["Electronics", "Apparel", "Home", "Beauty", "Sports", "Books", "Grocery"];
  const regions = ["North", "South", "East", "West"];
  // Apparel & Beauty have higher return rates; Electronics highest revenue.
  const returnRate = { Electronics: 0.04, Apparel: 0.22, Home: 0.08, Beauty: 0.18, Sports: 0.1, Books: 0.05, Grocery: 0.02 };
  const revBase = { Electronics: 900, Apparel: 220, Home: 340, Beauty: 130, Sports: 260, Books: 45, Grocery: 70 };

  const rows = [];
  const start = new Date("2023-01-01").getTime();
  const dayMs = 86_400_000;
  const n = 1000;
  for (let i = 0; i < n; i++) {
    const dayOffset = randint(r, 0, 729); // 2023-01-01 .. 2024-12-31
    const date = new Date(start + dayOffset * dayMs);
    const category = pick(r, categories);
    const region = wpick(r, regions, [30, 28, 18, 24]);

    // Revenue grows ~ over time, strongest in South & West.
    const growth = 1 + (dayOffset / 729) * (region === "South" || region === "West" ? 0.6 : 0.2);
    const units = randint(r, 1, 60);
    const unitPrice = revBase[category] * (0.7 + r() * 0.6);
    const revenue = Math.round(units * unitPrice * growth * 100) / 100;
    const returns = Math.min(units, Math.round(units * returnRate[category] * (0.5 + r())));

    rows.push({
      date: date.toISOString().slice(0, 10),
      category,
      region,
      revenue,
      units,
      returns,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return toCsv(["date", "category", "region", "revenue", "units", "returns"], rows);
}

// ============================================================
// 3) Employee attrition (~800 rows) — clean, with real drivers
// ============================================================
function attrition() {
  const r = rng(303);
  const depts = ["Engineering", "Sales", "Marketing", "Support", "HR", "Finance", "Operations"];
  const bands = ["Band A", "Band B", "Band C", "Band D", "Band E"];
  // Baseline attrition propensity by department.
  const deptRisk = { Engineering: 0.12, Sales: 0.34, Marketing: 0.2, Support: 0.3, HR: 0.15, Finance: 0.14, Operations: 0.22 };

  const rows = [];
  const n = 800;
  for (let i = 0; i < n; i++) {
    const dept = pick(r, depts);
    const tenure = Math.round((0.2 + r() * 9.5) * 10) / 10; // 0.2 .. 9.7 years
    const band = wpick(r, bands, [26, 26, 22, 16, 10]);
    const performance = wpick(r, [1, 2, 3, 4, 5], [6, 14, 40, 28, 12]);

    // Attrition probability: dept baseline, up for low tenure & low performance.
    let p = deptRisk[dept];
    if (tenure < 1.5) p += 0.2;
    else if (tenure > 6) p -= 0.08;
    if (performance <= 2) p += 0.18;
    else if (performance >= 4) p -= 0.06;
    p = Math.max(0.02, Math.min(0.85, p));
    const attrited = r() < p ? "Yes" : "No";

    rows.push({
      dept,
      tenure,
      salary_band: band,
      performance,
      attrited,
    });
  }
  return toCsv(["dept", "tenure", "salary_band", "performance", "attrited"], rows);
}

writeFileSync(join(OUT, "indian_startup_funding.csv"), startupFunding());
writeFileSync(join(OUT, "ecommerce_sales.csv"), ecommerceSales());
writeFileSync(join(OUT, "employee_attrition.csv"), attrition());
console.log("Wrote 3 sample datasets to public/samples/");
