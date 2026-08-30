/**
 * Bearer-token auth middleware for the app-facing API (ADR 0002:
 * send-before-record — auth reads are KV-cache-first so a warm cache lets
 * requests through a D1 outage; a cold cache during an outage has nothing
 * to verify against and fails closed with 503, which the ADR accepts).
 */

import { createMiddleware } from "hono/factory";
import { getAppByKeyHash, getDb } from "../db";
import { sha256Hex } from "../shared/crypto";
import { KV_TTL_SECONDS, kvAppByKeyHash } from "../shared/constants";
import type { AppEnv, AuthedApp } from "../shared/types";

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = parseBearerToken(c.req.header("authorization"));
  if (!token || !token.startsWith("sk_")) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const hash = await sha256Hex(token);
  const cacheKey = kvAppByKeyHash(hash);

  let authed: AuthedApp | null = null;
  try {
    authed = await c.env.CACHE.get<AuthedApp>(cacheKey, "json");
  } catch (err) {
    // KV failures are swallowed (ADR 0002) — fall through to D1.
    console.warn(
      JSON.stringify({
        event: "auth_cache_get_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    authed = null;
  }

  if (!authed) {
    const db = getDb(c.env);
    let row: Awaited<ReturnType<typeof getAppByKeyHash>>;
    try {
      row = await getAppByKeyHash(db, hash);
    } catch (err) {
      // Cold cache + D1 down: nothing to authenticate against (ADR 0002).
      console.error(
        JSON.stringify({
          event: "auth_d1_lookup_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return c.json({ error: "service unavailable" }, 503);
    }

    if (!row) {
      return c.json({ error: "unauthorized" }, 401);
    }

    authed = { id: row.id, name: row.name, isActive: row.isActive };

    // Cache write is best-effort and must never block/fail the request.
    const authedForCache = authed;
    c.executionCtx.waitUntil(
      c.env.CACHE.put(cacheKey, JSON.stringify(authedForCache), {
        expirationTtl: KV_TTL_SECONDS,
      }).catch((err: unknown) => {
        console.warn(
          JSON.stringify({ event: "auth_cache_put_failed", error: String(err) }),
        );
      }),
    );
  }

  if (!authed.isActive) {
    return c.json({ error: "forbidden" }, 403);
  }

  c.set("app", authed);
  await next();
});
