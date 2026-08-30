/**
 * Redirect-after-POST with a flash message carried in the query string
 * (?flash=...&flashType=...). Layout renders it; hono/jsx escapes the
 * interpolated text by default, so no manual HTML-escaping is needed here.
 */

import type { Context } from "hono";
import type { AppEnv } from "../shared/types";

export type FlashType = "success" | "error";

export interface Flash {
  message: string;
  type: FlashType;
}

/** Redirects (303, so POST becomes GET) to `path` with a flash message attached. */
export function redirectFlash(
  c: Context<AppEnv>,
  path: string,
  message: string,
  type: FlashType = "success",
): Response {
  const url = new URL(path, c.req.url);
  url.searchParams.set("flash", message);
  url.searchParams.set("flashType", type);
  return c.redirect(`${url.pathname}${url.search}`, 303);
}

/** Reads a flash message off the current request's query string, if any. */
export function readFlash(c: Context<AppEnv>): Flash | undefined {
  const message = c.req.query("flash");
  if (!message) return undefined;
  const type: FlashType = c.req.query("flashType") === "error" ? "error" : "success";
  return { message, type };
}
