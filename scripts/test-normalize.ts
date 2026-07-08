import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { normalizeMatrix } from "../server/ingest/normalize";

const text = readFileSync("public/samples/messy_sales.csv", "utf8");
const res = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy" });
const matrix = (res.data as unknown as string[][]).map(r => r.map(c => String(c ?? "")));

const out = normalizeMatrix(matrix);
console.log("header:", out.header);
console.log("rows:", out.rows.length);
console.log("first row:", out.rows[0]);
console.log("normalizations:");
for (const n of out.normalizations) console.log(" -", n.kind, "|", n.detail);

const checks = {
  sixRows: out.rows.length === 6,
  headerCorrect: out.header[0] === "Region" && out.header.includes("Notes_2"),
  currencyCleaned: out.rows[0][2] === "1200500",
  accountingNeg: out.rows[0][3] === "-300200",
  percentStripped: out.rows[0][4] === "25.5",
  preambleSkipped: out.normalizations.some(n => n.kind === "skipped_preamble"),
};
console.log("\nCHECKS:", checks);
if (Object.values(checks).every(Boolean)) console.log("NORMALIZE PASS");
else { console.log("NORMALIZE FAIL"); process.exit(1); }
