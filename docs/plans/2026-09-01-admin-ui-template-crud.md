# Admin UI: template create/edit/delete

**Date:** 2026-09-01 · **Status:** implemented 2026-09-01 (plus fix: isUniqueConstraintError must walk err.cause — drizzle wraps D1 errors in DrizzleQueryError; helper now shared from src/db/queries.ts)

## Validated finding

The backend fully supports template CRUD; the gap is UI-only.

| Layer | State | Evidence (personally verified) |
| --- | --- | --- |
| D1 schema | `templates(id, appId, name, body, createdAt, updatedAt)`, unique `(appId, name)` | `src/db/schema.ts:71-82`, `drizzle/0000_tiny_hercules.sql:102` |
| Data layer | `createTemplate` / `updateTemplate` / `deleteTemplate` / `getTemplate` / `listTemplates`, all app-scoped | `src/db/queries.ts:243-282` |
| API | Full CRUD at `/v1/templates`: GET list, POST (name 1-64, body 1-`MAX_MESSAGE_LENGTH`, 409 on duplicate name), PUT `/:id`, DELETE `/:id` | `src/api/templates.ts` |
| Admin UI | **Read-only.** App detail page lists templates (name/body/Segments/updated) with empty-state hint literally saying `POST /v1/templates`. No create, edit, or delete anywhere; no `/templates` admin route; no nav item | `src/ui/pages/apps.tsx:345-373`, `src/ui/index.tsx:50-70`, `src/ui/layout.tsx:20` |

Facts that shape the design:

- **No KV caching of templates** — the send path fetches from D1 by
  `(appId, id)` per request (`src/api/sms.ts:131,266`). UI mutations therefore
  need **no cache invalidation** (unlike masking profiles, which call
  `invalidateAppConfig`).
- **Deleting a template cannot break an in-flight job** — the job payload
  snapshots `templateBody` into R2 at creation (`src/api/sms.ts:304`) and the
  queue consumer renders from that snapshot (`src/queue/consumer.ts:257`),
  never re-fetching by id. A delete only 404s *future* API calls that
  reference the id.
- **Editing beats delete+recreate** because recreate changes the id, and API
  clients reference templates by id.
- The UI is pure server-rendered HTML forms — zero client JS by design
  (`src/ui/layout.tsx:6`). No live segment preview is possible; the
  `<Segments>` preview renders after save, as it already does in the list.
- Tokens are **not** validated at write time anywhere (API included); they're
  interpreted only at render time, missing vars → empty string
  (`src/sms/template.ts:9-11`, CONTEXT.md "Template"). The UI should match the
  API and not invent stricter rules. `extractTokens`
  (`src/sms/template.ts:14`) exists with zero callers — the edit page can
  finally use it for a read-only "tokens found: %NAME%, %CODE%" hint.

## Design

Mirror the masking-profiles pattern (per-app sub-resource, managed from the
app detail page, POST → `redirectFlash` 303): `src/ui/pages/apps.tsx:302-341`
(create form in `panel-foot`), `:460-511` (create/delete handlers).

### Routes (`src/ui/index.tsx`, after `authMiddleware`, with the other `/apps/:id/*` routes)

```
POST /apps/:id/templates                        appTemplateCreatePost
GET  /apps/:id/templates/:templateId            templateEditGet   (edit page)
POST /apps/:id/templates/:templateId            templateEditPost  (save)
POST /apps/:id/templates/:templateId/delete     appTemplateDeletePost
```

CSRF + session auth are inherited automatically by registration order
(`src/ui/index.tsx:38-46`).

The `GET …/templates/:templateId` edit page is a **new pattern** for this UI
(nothing has a dedicated edit page today). Justification: template bodies run
to 1,000 chars — an inline per-row edit form in the list table is
impractical, and delete+recreate breaks client-held ids. Alternative
considered: create+delete only (exact masking-profile parity, smaller diff) —
rejected for the id-stability reason, but it's a valid fallback if a smaller
change is preferred.

### App detail page (`src/ui/pages/apps.tsx`, Templates panel `:345-373`)

1. Add an **Actions** column to the table: an `Edit` link to
   `adminPath(`/apps/${app.id}/templates/${tpl.id}`)` and a `Delete` form
   (`btn btn-danger btn-sm`), same markup as the masking-profile row delete.
2. Add a create form in `panel-foot` (same placement as masking profiles):
   - `name`: `<input class="input" maxlength={64} required>`
   - `body`: `<textarea class="input" name="body" rows={3} maxlength={MAX_MESSAGE_LENGTH} required>`
     — `textarea.input` styling already exists (`src/ui/layout.tsx:487`).
   - Submit: `Add template`.
   - A muted hint line: `Use %TOKENS% (A-Z, 0-9, _) for per-recipient values;
     a missing variable renders as empty.`
3. Update the empty state: `hint="Add one below."` (the current
   `POST /v1/templates` hint becomes wrong the moment the form exists).

### Edit page (new file `src/ui/pages/templates.tsx`)

Keep `apps.tsx` from growing further (it's ~520 lines). One page component +
two handlers:

- `templateEditGet`: parse `id`/`templateId` (`parseId`), fetch app
  (`getAppById`) and template (`getTemplate(db, id, templateId)`), 404 via the
  same not-found handling as other pages when either is missing. Render
  `Layout active="apps"` (no new NavKey), `Breadcrumb` Apps → app name →
  template name, a form pre-filled with name/body posting to the same URL,
  plus read-only context: `<Segments body={tpl.body}>` and the token list
  from `extractTokens(tpl.body)`.
- `templateEditPost`: same guards; validate name 1-64 and body
  1-`MAX_MESSAGE_LENGTH` (identical messages to `src/api/templates.ts`);
  `updateTemplate(db, id, templateId, {name, body})`; `undefined` result →
  not-found flash; unique-violation catch → flash
  `A template named "X" already exists.` (string-match `UNIQUE`, same as
  `isUniqueConstraintError` in `src/api/templates.ts:15-18`); success →
  `redirectFlash(c, adminPath(`/apps/${id}`), "Template updated.")`.

### Create/delete handlers (in `apps.tsx`, beside the masking-profile ones)

- `appTemplateCreatePost`: guards (`parseId` → `getAppById` →
  `notFoundOrRedirect`), `formStr` for name/body, validate as above,
  `createTemplate`, unique-violation → error flash, success →
  `redirectFlash(…, "Template added.")`. **No** `invalidateAppConfig` — add a
  one-line comment stating templates aren't KV-cached so no invalidation is
  needed (otherwise the asymmetry with the neighbouring masking handlers
  looks like a bug).
- `appTemplateDeletePost`: mirror `appMaskingDeletePost`
  (`src/ui/pages/apps.tsx:492-511`); flash on success:
  `Template deleted. API calls still sending templateId=N will now get 404.`
  In-flight jobs are unaffected (payload snapshot — see finding above).

### Shared constant (small, optional but recommended)

`64` (name cap) is currently a magic number in `src/api/templates.ts`. Add
`MAX_TEMPLATE_NAME_LENGTH = 64` to `src/shared/constants.ts` and use it in
both the API validator and the new UI forms/handlers so they can't drift.

## Out of scope

- Client-side live segment preview (needs JS; the UI is deliberately
  script-free).
- Template UI outside the app detail page (top-level nav item): templates are
  app-owned; the per-app panel is the right home at this scale.
- API changes — none needed. (`GET /v1/templates/:id` doesn't exist but
  nothing requires it.)

## Verification

1. `npm run typecheck` and `npm test` stay clean (40 existing tests).
2. New tests, following `test/` harness conventions (vitest 4 +
   `@cloudflare/vitest-plugin`, real bindings): a `test/ui-templates.test.ts`
   exercising the four handlers with a stubbed session is possible but the UI
   layer currently has zero tests — proportional minimum is API-level tests
   for `/v1/templates` CRUD (also currently untested) reusing the
   `body-limit.test.ts` app-stub pattern, since UI handlers call the same
   `src/db/queries.ts` functions.
3. Manual: `npm run dev` → create app → add template (dup name → error
   flash; 65-char name → error flash) → edit body → verify Segments/token
   hint on edit page → delete → empty state returns.
