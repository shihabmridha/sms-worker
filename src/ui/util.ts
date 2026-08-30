/**
 * Small formatting / parsing helpers shared by the admin pages. Numbers
 * parsed from query strings and form bodies are always parsed defensively —
 * a bad value falls back rather than producing NaN/undefined downstream.
 */

export const PAGE_SIZE = 20;

/** Defensive non-negative integer offset from a query param. */
export function parseOffset(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 0;
  return n;
}

/** Defensive integer with a fallback (used for priority inputs). */
export function parseIntOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return n;
}

/** Defensive positive integer id from a route param; null when invalid. */
export function parseId(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Unix-second timestamp → UTC ISO string; "—" for null/undefined. */
export function formatTs(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return "—";
  return new Date(ts * 1000).toISOString();
}

/** Pulls a trimmed string out of a parsed form body (parseBody() values may be File). */
export function formStr(value: string | File | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Same as formStr but preserves leading/trailing whitespace (passwords). */
export function formRaw(value: string | File | undefined): string {
  return typeof value === "string" ? value : "";
}

/** Presence check for an HTML checkbox field in parsed form data. */
export function formChecked(value: string | File | undefined): boolean {
  return typeof value === "string" && value.length > 0;
}
