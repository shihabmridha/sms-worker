import { PHONE_REGEX } from "../shared/constants";

/** Permissive shape check only — see CONTEXT.md "Recipient". Not normalization. */
export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

/**
 * Ported from acadion's phoneMask.ts. First 3 chars + `****` + last 4 chars.
 * Used everywhere a phone number would otherwise land in a log line — never
 * log a full recipient number.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "****";
  const trimmed = phone.trim();
  if (trimmed.length < 8) return "****";
  const head = trimmed.slice(0, 3);
  const tail = trimmed.slice(-4);
  return `${head}****${tail}`;
}
