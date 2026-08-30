/**
 * Cron trigger (wrangler.jsonc: "0 21 * * *") — nightly history retention
 * purge. Never throws: a purge failure is a structured log, not a worker
 * error (there is no caller to retry against).
 */

import { getDb } from "../db";
import { purgeOlderThan } from "../db/queries";
import { RETENTION_DAYS } from "../shared/constants";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  try {
    const db = getDb(env);
    const deleted = await purgeOlderThan(db, RETENTION_DAYS);
    console.log(
      JSON.stringify({
        event: "retention_purge_completed",
        ts: nowSeconds(),
        cron: controller.cron,
        retentionDays: RETENTION_DAYS,
        deletedMessages: deleted.messages,
        deletedJobChunks: deleted.jobChunks,
        deletedJobs: deleted.jobs,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "retention_purge_failed",
        ts: nowSeconds(),
        cron: controller.cron,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
