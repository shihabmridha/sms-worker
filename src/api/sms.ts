/**
 * Send/Job routes. ADR 0002 (send-before-record) governs both paths:
 * provider dispatch happens first and its result is what the caller gets
 * back; D1 history writes happen after and are best-effort, wrapped so a
 * D1 failure never turns an accepted send into a failed response.
 */

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  getDb,
  getJobForApp,
  getTemplate,
  insertJobChunks,
  insertJob,
  insertMessages,
  jobs,
  listMessagesByJob,
  markJobFailed,
  type NewMessageRow,
} from "../db";
import { buildDispatchPlan } from "../core/plan";
import { dispatch } from "../sms/dispatch";
import { isValidPhone } from "../sms/phone";
import { renderTemplate } from "../sms/template";
import {
  CHUNK_SIZE,
  MAX_BODY_BYTES,
  MAX_JOB_RECIPIENTS,
  MAX_MESSAGE_LENGTH,
  MAX_SYNC_BODY_BYTES,
  MAX_SYNC_RECIPIENTS,
  r2JobKey,
} from "../shared/constants";
import type {
  AppEnv,
  ChunkQueueMessage,
  DispatchInput,
  DispatchResultItem,
  JobPayload,
  JobRecipient,
} from "../shared/types";
import {
  assertRecipientCount,
  fail,
  normalizeRecipients,
  parseQueryInt,
  readJsonBody,
  truncate,
  type RecipientInput,
} from "./validate";

export const smsRoutes = new Hono<AppEnv>();

/** Cloudflare Queues hard cap on messages per sendBatch() call. */
const QUEUE_SEND_BATCH_LIMIT = 100;
const REASON_MAX_LENGTH = 500;

/** Shared 413 handler for both body-limit middlewares below — matches the
 *  API's normal error envelope via `fail()` + the apiRoutes-level onError
 *  (see api/index.ts) rather than hono/body-limit's plain-text default. */
const rejectOversizedBody = () => fail(413, "request body too large");

interface SendFields {
  message?: string;
  templateId?: number;
  maskingProfile?: string;
  recipients: unknown;
}

function parseSendFields(raw: unknown): SendFields {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail(400, "body must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;

  if (obj.message !== undefined && typeof obj.message !== "string") {
    fail(400, `"message" must be a string`);
  }
  if (
    obj.templateId !== undefined &&
    (typeof obj.templateId !== "number" || !Number.isInteger(obj.templateId))
  ) {
    fail(400, `"templateId" must be an integer`);
  }
  if (obj.maskingProfile !== undefined && typeof obj.maskingProfile !== "string") {
    fail(400, `"maskingProfile" must be a string`);
  }

  return {
    message: obj.message as string | undefined,
    templateId: obj.templateId as number | undefined,
    maskingProfile: obj.maskingProfile as string | undefined,
    recipients: obj.recipients,
  };
}

/** Body-source rule shared by both routes: an explicit per-recipient message
 *  wins, then a template render, then the request-level uniform message. */
function computeBody(
  recipient: RecipientInput,
  opts: { message: string | undefined; templateBody: string | undefined },
): string | undefined {
  if (recipient.message !== undefined) return recipient.message;
  if (opts.templateBody !== undefined) return renderTemplate(opts.templateBody, recipient.vars);
  return opts.message;
}

function hadOverride(recipient: RecipientInput): boolean {
  return recipient.vars !== undefined || recipient.message !== undefined;
}

/* ------------------------------------------------------------------ */
/* POST /sms/send — sync, inline dispatch                              */
/* ------------------------------------------------------------------ */

smsRoutes.post(
  "/sms/send",
  bodyLimit({ maxSize: MAX_SYNC_BODY_BYTES, onError: rejectOversizedBody }),
  async (c) => {
    const db = getDb(c.env);
    const app = c.var.app;

    const raw = await readJsonBody<unknown>(c);
    const fields = parseSendFields(raw);
    const normalized = normalizeRecipients(fields.recipients);
    assertRecipientCount(normalized.length, MAX_SYNC_RECIPIENTS);

    let templateBody: string | undefined;
    if (fields.templateId !== undefined) {
      const template = await getTemplate(db, app.id, fields.templateId);
      if (!template) return fail(404, "template not found");
      templateBody = template.body;
    }

    // Body-source validation applies to every recipient, regardless of phone
    // validity — an invalid phone still needs a resolvable body to be a valid
    // request at all.
    const bodies: string[] = normalized.map((recipient, index) => {
      const body = computeBody(recipient, { message: fields.message, templateBody });
      if (body === undefined || body.length === 0) {
        return fail(400, `recipients[${index}]: no message body resolved`);
      }
      if (body.length > MAX_MESSAGE_LENGTH) {
        return fail(400, `recipients[${index}]: body exceeds ${MAX_MESSAGE_LENGTH} characters`);
      }
      return body;
    });

    const validIndexes: number[] = [];
    normalized.forEach((recipient, index) => {
      if (isValidPhone(recipient.to)) validIndexes.push(index);
    });
    const validRecipients = validIndexes.map((i) => normalized[i] as RecipientInput);
    const validBodies = validIndexes.map((i) => bodies[i] as string);

    const allSameBody = validBodies.length > 0 && validBodies.every((b) => b === validBodies[0]);
    const anyOverride = validRecipients.some(hadOverride);
    const uniform = allSameBody && !anyOverride;

    const dispatchInput: DispatchInput = uniform
      ? { kind: "uniform", message: validBodies[0] as string, recipients: validRecipients.map((r) => r.to) }
      : {
          kind: "dynamic",
          messages: validRecipients.map((r, i) => ({ to: r.to, message: validBodies[i] as string })),
        };

    const { entries, warnings } = await buildDispatchPlan(c.env, db, app.id, fields.maskingProfile);
    const dispatchResults =
      validRecipients.length > 0 ? await dispatch(entries, dispatchInput) : [];

    const results: DispatchResultItem[] = normalized.map((recipient) => ({
      to: recipient.to,
      accepted: false,
      reason: "invalid phone number",
      provider: null,
    }));
    validIndexes.forEach((originalIndex, vi) => {
      const result = dispatchResults[vi];
      if (result) results[originalIndex] = result;
    });

    const id = crypto.randomUUID();
    const sentCount = results.filter((r) => r.accepted).length;
    const failedCount = results.length - sentCount;
    const nowSeconds = Math.floor(Date.now() / 1000);

    const jobBody: string | null =
      fields.templateId !== undefined ? (templateBody ?? null) : uniform ? (validBodies[0] ?? null) : null;

    // History write is best-effort and happens after the response is already
    // decided (ADR 0002) — never awaited by the request itself. `insertJob`'s
    // NewJobInput intentionally omits sent/failed/completedAt (those are only
    // meaningful once dispatch has happened, which for a sync send is *now*),
    // so this writes the jobs row directly via the schema table rather than
    // through that helper.
    c.executionCtx.waitUntil(
      (async () => {
        try {
          await db.insert(jobs).values({
            id,
            appId: app.id,
            kind: "sync",
            status: failedCount > 0 ? "completed_with_errors" : "completed",
            body: jobBody,
            templateId: fields.templateId ?? null,
            maskingProfile: fields.maskingProfile ?? null,
            total: normalized.length,
            sent: sentCount,
            failed: failedCount,
            chunkCount: 0,
            chunksDone: 0,
            completedAt: nowSeconds,
            createdAt: nowSeconds,
          });

          const rows: NewMessageRow[] = normalized.map((recipient, index) => {
            const result = results[index] as DispatchResultItem;
            return {
              jobId: id,
              appId: app.id,
              recipient: recipient.to,
              body: recipient.message !== undefined ? recipient.message : null,
              provider: result.provider ?? null,
              status: result.accepted ? "sent" : "failed",
              reason: result.reason ? truncate(result.reason, REASON_MAX_LENGTH) : null,
              trackingId: result.trackingId ?? null,
            };
          });
          await insertMessages(db, rows);
        } catch (err) {
          console.error(
            JSON.stringify({
              event: "sync_history_write_failed",
              appId: app.id,
              jobId: id,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      })(),
    );

    return c.json({ id, results, warnings }, 200);
  },
);

/* ------------------------------------------------------------------ */
/* POST /sms/jobs — bulk, async via queue                              */
/* ------------------------------------------------------------------ */

smsRoutes.post(
  "/sms/jobs",
  bodyLimit({ maxSize: MAX_BODY_BYTES, onError: rejectOversizedBody }),
  async (c) => {
    const db = getDb(c.env);
    const app = c.var.app;

    const raw = await readJsonBody<unknown>(c);
    const fields = parseSendFields(raw);
    const normalized = normalizeRecipients(fields.recipients);
    assertRecipientCount(normalized.length, MAX_JOB_RECIPIENTS);

    let templateBody: string | undefined;
    if (fields.templateId !== undefined) {
      const template = await getTemplate(db, app.id, fields.templateId);
      if (!template) return fail(404, "template not found");
      templateBody = template.body;
    }

    // Strict validation: unlike /sms/send, an invalid phone or missing body
    // rejects the whole request rather than becoming a soft per-recipient
    // failure — a bulk job has no synchronous per-recipient response to carry
    // that information back on.
    const offending: number[] = [];
    normalized.forEach((recipient, index) => {
      const body = computeBody(recipient, { message: fields.message, templateBody });
      const bodyOk = body !== undefined && body.length > 0 && body.length <= MAX_MESSAGE_LENGTH;
      const phoneOk = isValidPhone(recipient.to);
      if (!bodyOk || !phoneOk) offending.push(index);
    });
    if (offending.length > 0) {
      return c.json({ error: "invalid recipients", indexes: offending.slice(0, 10) }, 400);
    }

    const anyOverride = normalized.some(hadOverride);
    const jobId = crypto.randomUUID();
    const chunkCount = Math.ceil(normalized.length / CHUNK_SIZE);

    const payloadRecipients: JobRecipient[] = normalized.map((recipient) => ({
      to: recipient.to,
      ...(recipient.message !== undefined ? { message: recipient.message } : {}),
      ...(recipient.vars !== undefined ? { vars: recipient.vars } : {}),
    }));

    const payload: JobPayload = {
      jobId,
      appId: app.id,
      // Uniform body is only meaningful when nothing renders it per-recipient.
      ...(fields.templateId === undefined && !anyOverride && fields.message !== undefined
        ? { message: fields.message }
        : {}),
      ...(fields.templateId !== undefined
        ? { templateId: fields.templateId, templateBody: templateBody as string }
        : {}),
      ...(fields.maskingProfile !== undefined ? { maskingProfile: fields.maskingProfile } : {}),
      chunkSize: CHUNK_SIZE,
      recipients: payloadRecipients,
    };

    const r2Key = r2JobKey(jobId);
    await c.env.PAYLOADS.put(r2Key, JSON.stringify(payload));

    const jobBody: string | null =
      fields.templateId !== undefined ? (templateBody as string) : (payload.message ?? null);

    try {
      await insertJob(db, {
        id: jobId,
        appId: app.id,
        kind: "bulk",
        status: "queued",
        body: jobBody,
        templateId: fields.templateId ?? null,
        maskingProfile: fields.maskingProfile ?? null,
        total: normalized.length,
        chunkCount,
      });
      await insertJobChunks(db, jobId, chunkCount);
    } catch (err) {
      await c.env.PAYLOADS.delete(r2Key).catch((delErr: unknown) => {
        console.warn(
          JSON.stringify({ event: "job_payload_cleanup_failed", jobId, error: String(delErr) }),
        );
      });
      console.error(
        JSON.stringify({
          event: "job_d1_write_failed",
          jobId,
          appId: app.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return fail(503, "job could not be recorded; try again");
    }

    try {
      const chunkMessages: ChunkQueueMessage[] = Array.from({ length: chunkCount }, (_, i) => ({
        jobId,
        chunkIndex: i,
      }));
      for (let offset = 0; offset < chunkMessages.length; offset += QUEUE_SEND_BATCH_LIMIT) {
        const slice = chunkMessages.slice(offset, offset + QUEUE_SEND_BATCH_LIMIT);
        await c.env.SMS_QUEUE.sendBatch(slice.map((body) => ({ body })));
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "job_enqueue_failed",
          jobId,
          appId: app.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      await markJobFailed(db, jobId, "failed to enqueue chunks").catch((markErr: unknown) => {
        console.error(
          JSON.stringify({ event: "job_mark_failed_failed", jobId, error: String(markErr) }),
        );
      });
      await c.env.PAYLOADS.delete(r2Key).catch(() => {
        // best-effort; the job is already marked failed above
      });
      return fail(503, "job accepted but could not be queued");
    }

    return c.json({ jobId, total: normalized.length, chunkCount }, 202);
  },
);

/* ------------------------------------------------------------------ */
/* GET /sms/jobs/:id, GET /sms/jobs/:id/messages                       */
/* ------------------------------------------------------------------ */

smsRoutes.get("/sms/jobs/:id", async (c) => {
  const db = getDb(c.env);
  const job = await getJobForApp(db, c.var.app.id, c.req.param("id"));
  if (!job) return fail(404, "job not found");
  return c.json(job, 200);
});

smsRoutes.get("/sms/jobs/:id/messages", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");
  const job = await getJobForApp(db, c.var.app.id, id);
  if (!job) return fail(404, "job not found");

  const limit = parseQueryInt(c.req.query("limit"), { default: 50, min: 1, max: 200 });
  const offset = parseQueryInt(c.req.query("offset"), { default: 0, min: 0 });
  const messages = await listMessagesByJob(db, id, { limit, offset });
  return c.json({ jobId: id, limit, offset, messages }, 200);
});
