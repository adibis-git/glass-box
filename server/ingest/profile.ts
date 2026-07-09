// Source-intelligence layer (v3 §4) — per-column semantic profiling.
//
// Pure, deterministic heuristics over the SAMPLE rows the dataset already
// stores (never the full file). Produces the ColumnProfile[] half of
// Dataset.profile; the Claude "domain read" (datasetIntelligence.ts) fills the
// other half. The agent core reads both back via lib/agent/context.ts.

import type { ColumnProfile } from "@/lib/agent/context";

const ID_NAME = /(^|_)id$/i;
const CURRENCY_NAME = /_usd$|amount|price|value|revenue|cost|salary/i;
const USD_NAME = /_usd$/i;
const BOOL_VALUE = /^(true|false|0|1|yes|no)$/i;
const DATE_LIKE = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/;

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** Parse a date-like string to an epoch ms, or null when it isn't a date. */
function parseDate(s: string): number | null {
  if (!DATE_LIKE.test(s)) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Profile every column over the stored sample rows. Deterministic — same input
 * always yields the same output. Cardinality/nullRate/range are all computed
 * over the sample, which is an acceptable approximation for a large file.
 */
export function computeColumnProfiles(
  sampleRows: Record<string, unknown>[],
  columnSchema: { name: string; dtype: string }[],
): ColumnProfile[] {
  return columnSchema.map((col) => {
    const raw = sampleRows.map((r) => r[col.name]);
    const total = raw.length;
    const nonNull = raw.filter((v) => !isBlank(v)).map((v) => String(v).trim());
    const nullRate = total > 0 ? (total - nonNull.length) / total : 0;

    const distinct = new Set(nonNull);
    const cardinality = distinct.size;

    const dtype = col.dtype;
    const numericDtype = dtype === "integer" || dtype === "float";
    const numericValues =
      nonNull.length > 0 && nonNull.every((v) => v !== "" && !Number.isNaN(Number(v)));
    const isNumeric = numericDtype || numericValues;

    const dateDtype = dtype === "datetime" || dtype === "date";
    const dateValues = nonNull.length > 0 && nonNull.every((v) => parseDate(v) !== null);
    const isDate = dateDtype || dateValues;

    const boolValues = nonNull.length > 0 && nonNull.every((v) => BOOL_VALUE.test(v));
    const isBool = dtype === "boolean" || boolValues;

    // --- semantic type (order matters; mirrors the v3 spec) ---
    let semanticType: ColumnProfile["semanticType"];
    let unit: string | undefined;
    if (ID_NAME.test(col.name)) {
      semanticType = "id";
    } else if (CURRENCY_NAME.test(col.name) && isNumeric) {
      semanticType = "currency";
      if (USD_NAME.test(col.name)) unit = "USD";
    } else if (isDate) {
      semanticType = "date";
    } else if (isBool) {
      semanticType = "boolean";
    } else if (!isNumeric && cardinality > 0 && cardinality <= 25) {
      semanticType = "category";
    } else if (isNumeric) {
      semanticType = "metric";
    } else {
      semanticType = "text";
    }

    const profile: ColumnProfile = {
      name: col.name,
      dtype,
      semanticType,
      cardinality,
      nullRate,
    };
    if (unit) profile.unit = unit;

    // --- range (numeric / date) ---
    if (isNumeric && !isDate) {
      const nums = nonNull.map(Number).filter((n) => !Number.isNaN(n));
      if (nums.length > 0) {
        profile.range = { min: String(Math.min(...nums)), max: String(Math.max(...nums)) };
      }
    } else if (isDate) {
      const times = nonNull
        .map(parseDate)
        .filter((t): t is number => t !== null);
      if (times.length > 0) {
        profile.range = { min: iso(Math.min(...times)), max: iso(Math.max(...times)) };
      }
    }

    // --- top categories (low cardinality only) ---
    if (cardinality > 0 && cardinality <= 25) {
      const counts = new Map<string, number>();
      for (const v of nonNull) counts.set(v, (counts.get(v) ?? 0) + 1);
      profile.topCategories = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }));
    }

    return profile;
  });
}
