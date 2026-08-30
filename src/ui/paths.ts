/**
 * Absolute /admin/... URL helpers. Route registration inside adminRoutes
 * stays relative ("/jobs", "/apps/:id"); every link, form action, and
 * server-side redirect goes through here so it resolves correctly at the
 * orchestrator's mount point (spec: mounted at /admin).
 */

export const ADMIN_BASE = "/admin";

/** Builds an absolute admin URL. `adminPath("/")` intentionally yields
 *  ADMIN_BASE with no trailing slash — Hono's router treats "/admin" and
 *  "/admin/" as distinct paths, and only the former matches `.get("/")`. */
export function adminPath(path: string): string {
  return path === "/" ? ADMIN_BASE : `${ADMIN_BASE}${path}`;
}
