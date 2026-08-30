/**
 * Sizing constants. Several are pinned by Workers FREE plan limits
 * (50 D1 queries + 50 subrequests per invocation, 10ms CPU) — see comments
 * before raising them. On Workers Paid these can grow substantially.
 */

/** Recipients per queue chunk. 250 → ~25 batched D1 insert statements. */
export const CHUNK_SIZE = 250;

/** Hard cap on recipients per bulk Job (v1 guardrail, Q21). */
export const MAX_JOB_RECIPIENTS = 50_000;

/** Sync /send cap; bigger sends must use the job path. */
export const MAX_SYNC_RECIPIENTS = 100;

/** Max accepted JSON body for job submission. */
export const MAX_BODY_BYTES = 25 * 1024 * 1024;

/** Message body length cap (matches acadion's contract). */
export const MAX_MESSAGE_LENGTH = 1000;

/** History retention (Q9); enforced by the nightly cron. */
export const RETENTION_DAYS = 90;

/** Chunk retry backoff: RETRY_BASE_SECONDS * 2^attempt, capped. */
export const RETRY_BASE_SECONDS = 30;
export const RETRY_MAX_SECONDS = 3600;

/** Rows per batched INSERT — messages table has 10 bound params/row and D1
 *  caps at 100 bound parameters per statement. */
export const HISTORY_INSERT_ROWS = 10;

/** Permissive phone validation ported from acadion (BD-flavored, not enforced). */
export const PHONE_REGEX = /^\+?[0-9]{11,14}$/;

/** Template placeholder token: %NAME% (uppercase alnum + underscore). */
export const TEMPLATE_TOKEN_REGEX = /%([A-Z0-9_]+)%/g;

/** KV cache keys + TTLs (seconds). D1 is source of truth; ADR 0002 makes the
 *  cache a send-path availability shield, hence the generous TTLs. */
export const KV_TTL_SECONDS = 300;
export const kvAppByKeyHash = (keyHash: string) => `app:key:${keyHash}`;
export const kvAppConfig = (appId: number) => `app:config:${appId}`;

/** R2 object key for a Job payload. */
export const r2JobKey = (jobId: string) => `jobs/${jobId}.json`;

/** Session cookie name for the admin UI. */
export const SESSION_COOKIE = "sms_admin_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
