import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Simple id generator for feed items and requests. */
let counter = 0;
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}-${counter}-${Math.floor(performance.now())}`;
}

// ── Pinned-locale formatters ────────────────────────────────────────────────
// Never use bare toLocaleString()/toLocaleDateString() in client components:
// the server renders with Node's locale (en-US) and the browser with the
// user's (e.g. en-IN lakh grouping: 8,12,076), causing hydration mismatches.

const INT_FMT = new Intl.NumberFormat("en-US");
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const DATETIME_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const fmtInt = (n: number | bigint): string => INT_FMT.format(n);
export const fmtDate = (d: Date | string): string =>
  DATE_FMT.format(typeof d === "string" ? new Date(d) : d);
export const fmtDateTime = (d: Date | string): string =>
  DATETIME_FMT.format(typeof d === "string" ? new Date(d) : d);
