/**
 * Template CRUD, scoped to the authenticated App (c.var.app.id).
 */

import { Hono } from "hono";
import { createTemplate, deleteTemplate, getDb, listTemplates, updateTemplate } from "../db";
import { MAX_MESSAGE_LENGTH } from "../shared/constants";
import type { AppEnv } from "../shared/types";
import { fail, parseIdParam, readJsonBody } from "./validate";

export const templatesRoutes = new Hono<AppEnv>();

/** D1/SQLite surfaces a unique-index violation as a plain Error whose message
 *  names the constraint; there's no typed error class exported for it. */
function isUniqueConstraintError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.toUpperCase().includes("UNIQUE");
}

function validateName(name: unknown): string {
  if (typeof name !== "string" || name.length < 1 || name.length > 64) {
    return fail(400, `"name" must be 1-64 characters`);
  }
  return name;
}

function validateBody(body: unknown): string {
  if (typeof body !== "string" || body.length < 1 || body.length > MAX_MESSAGE_LENGTH) {
    return fail(400, `"body" must be 1-${MAX_MESSAGE_LENGTH} characters`);
  }
  return body;
}

templatesRoutes.get("/templates", async (c) => {
  const db = getDb(c.env);
  const rows = await listTemplates(db, c.var.app.id);
  return c.json(rows, 200);
});

templatesRoutes.post("/templates", async (c) => {
  const db = getDb(c.env);
  const raw = await readJsonBody<Record<string, unknown>>(c);
  const name = validateName(raw.name);
  const body = validateBody(raw.body);
  try {
    const row = await createTemplate(db, { appId: c.var.app.id, name, body });
    return c.json(row, 201);
  } catch (err) {
    if (isUniqueConstraintError(err)) return fail(409, "a template with this name already exists");
    throw err;
  }
});

templatesRoutes.put("/templates/:id", async (c) => {
  const db = getDb(c.env);
  const id = parseIdParam(c.req.param("id"));
  const raw = await readJsonBody<Record<string, unknown>>(c);
  const patch: { name?: string; body?: string } = {};
  if (raw.name !== undefined) patch.name = validateName(raw.name);
  if (raw.body !== undefined) patch.body = validateBody(raw.body);
  if (patch.name === undefined && patch.body === undefined) {
    return fail(400, "at least one of \"name\" or \"body\" is required");
  }
  try {
    const row = await updateTemplate(db, c.var.app.id, id, patch);
    if (!row) return fail(404, "template not found");
    return c.json(row, 200);
  } catch (err) {
    if (isUniqueConstraintError(err)) return fail(409, "a template with this name already exists");
    throw err;
  }
});

templatesRoutes.delete("/templates/:id", async (c) => {
  const db = getDb(c.env);
  const id = parseIdParam(c.req.param("id"));
  const ok = await deleteTemplate(db, c.var.app.id, id);
  if (!ok) return fail(404, "template not found");
  return c.json({ ok: true }, 200);
});
