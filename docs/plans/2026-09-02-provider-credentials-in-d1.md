# Provider credentials on demand (D1-backed, no wrangler secrets)

**Date:** 2026-09-02 · **Status:** implemented 2026-09-02

## Context

**Does it already support it? No.** Verified state:

| Layer | Today | Evidence |
| --- | --- | --- |
| Global provider credentials | Worker secrets only (`SMS_API_KEY`, `MIMSMS_API_KEY`, `MIMSMS_USERNAME`, `MIMSMS_SENDER_NAME`, `BULKSMSBD_SENDER_ID`), read in `buildDispatchPlan` | `src/core/plan.ts:105-127`, `README.md:41-49` |
| `provider_settings` table | `provider, enabled, priority, sender_id` — no key/username columns | `src/db/schema.ts:35-41` |
| Admin → Providers page | enable / priority / bulksmsbd sender id only; no credential inputs; save does **not** invalidate KV caches ("within 5 minutes") | `src/ui/pages/providers.tsx` |
| Per-app masking profiles | Already store an AES-GCM-encrypted API key in D1 (`api_key_enc`) via `encryptSecret`, invalidate cache on change | `src/db/schema.ts:54-69`, `src/ui/pages/apps.tsx:500-545` |

So a new BulkSMSBD account today means `wrangler secret put` × N. The user's decisions: **(a)** extend the existing one-row-per-provider `provider_settings` table with encrypted credentials editable on the Providers page, **(b)** remove the five env secrets entirely (D1 is the only source; `ENCRYPTION_KEY`, `SESSION_SECRET`, `ADMIN_BOOTSTRAP_PASSWORD`, `FAKE_SMS` stay).

Design reuses what exists: `encryptSecret`/`decryptSecret` (`src/shared/crypto.ts:147-165`), the KV app-config cache that already carries encrypted profile keys (`src/core/plan.ts:39-70`), the masking-profile form/handler idiom, and the `redirectFlash` + `upsertGlobalProvider` flow.

## Implementation (build order)

### 1. Schema + migration
`src/db/schema.ts` `providerSettings`: add nullable `apiKeyEnc text("api_key_enc")`, `username`, `senderName text("sender_name")`, and `updatedAt int("updated_at")` (nullable; drives the "set (updated …)" status). Keep `senderId`.
Initially generated as `drizzle/0001_new_wallflower.sql` (4 `ALTER TABLE provider_settings ADD COLUMN` statements), then squashed into `drizzle/0000_tiny_hercules.sql` because the app is pre-production: the four columns are now part of the `provider_settings` CREATE TABLE, `drizzle/meta/_journal.json` has a single `idx: 0` entry, and `0000_snapshot.json` reflects the full schema (`npm run db:generate` reports no drift).

### 2. Queries (`src/db/queries.ts:130-148`)
`upsertGlobalProvider` gains `apiKeyEnc?`, `username?`, `senderName?` with tri-state semantics: `undefined` = keep existing column, `null` = clear, string = set. Insert branch coalesces `undefined → null`; the `onConflictDoUpdate.set` spreads each field only when `!== undefined`. Always set `updatedAt: now()` in both branches.

### 3. Dispatch (`src/core/plan.ts`)
- `AppDispatchConfig`: replace `globalSenderIds` with `globals: Partial<Record<ProviderName, {senderId, senderName, username, apiKeyEnc}>>` built from full `getGlobalProviders` rows. Cached JSON carries ciphertext only (same as profiles).
- `buildDispatchPlan`: resolution is `profile.field ?? globals[provider]?.field`; delete every `env.SMS_API_KEY` / `env.MIMSMS_*` / `env.BULKSMSBD_SENDER_ID` read. Decrypt global `apiKeyEnc` with `decryptSecret` when no profile key. Missing API key still skips the provider but now pushes a warning: `` `${provider} omitted: no API key configured (Admin → Providers)` `` — additive only (`warnings` array in `/v1/sms/send` response `src/api/sms.ts:244`; consumer ignores warnings).
- Add `export async function invalidateAllAppConfigs(env)`: `env.CACHE.list({ prefix: "app:config:" })`, paginate on `cursor` until `list_complete`, delete each key (best-effort, log like `invalidateAppConfig`). Cost note in a comment: fires only on admin save; app count is tiny (deletes count toward the Workers Free 1,000 KV writes/day). Consequence for ADR 0002: a global save empties the availability shield for one refill cycle — acceptable, it's an explicit admin action.
- Update header comment (:5-11) and `src/shared/types.ts:24` comment: "global settings (D1, encrypted)" instead of "worker secrets".

### 4. Admin data (`src/ui/data.ts:105-125`)
`GlobalProviderRow` gains `username`, `senderName`, `hasApiKey: boolean`, `updatedAt: number | null`. Never pass `apiKeyEnc` to the view.

### 5. Providers page (`src/ui/pages/providers.tsx`)
- Table columns: Provider | Enabled | Priority | Sender ID (bulksmsbd) | Username (mimsms) | Sender name (mimsms) | API key. Non-applicable cells keep the existing `<span class="muted">Not used</span>`.
- API key cell: status line `API key: set · updated {formatTs}` or `not set`; a write-only `<input class="input mono" type="password" name="${provider}_apiKey" autocomplete="new-password" placeholder="leave blank to keep">` (never render the value); a `${provider}_clearApiKey` checkbox "Remove key".
- Subtitle: replace "Apps pick up changes within 5 minutes." with "Changes take effect immediately."
- `providersPost`: per provider parse `_enabled`, `_priority`, `_senderId`, `_username`, `_senderName` (`formStr`, empty → `null`), `_apiKey` (`formStr`), `_clearApiKey` (`formChecked`). Map: clear checked → `null`; non-empty key → `await encryptSecret(c.env, key)`; else `undefined`. Call `upsertGlobalProvider`, then `await invalidateAllAppConfigs(c.env)` once, then `redirectFlash(..., "Global provider settings saved.")`.

### 6. Remove env secrets
- `.dev.vars`: delete the five provider lines (FAKE_SMS, ENCRYPTION_KEY, SESSION_SECRET, ADMIN_BOOTSTRAP_PASSWORD stay). Add `.dev.vars.example` with those four keys and placeholder values (currently none exists).
- `npm run types` regenerates `worker-configuration.d.ts` (it's generated from wrangler.jsonc + .dev.vars); confirm the five keys are gone from `Env` and the `ProcessEnv` pick.
- `README.md:41-49`: drop the five `wrangler secret put` lines; add a "Provider credentials" step: "After first login, open Admin → Providers and enter each provider's API key / sender identity. Stored encrypted in D1 with `ENCRYPTION_KEY`; changes apply immediately." Note that local dev uses `FAKE_SMS=true` so no credentials are needed; to hit real providers locally set `FAKE_SMS=false` and enter credentials in the UI.
- `CONTEXT.md:21-24` Masking Profile: "Absent a profile, the global Provider credentials (encrypted in D1, managed at Admin → Providers) are used."
- `npm run typecheck` is the safety net for any missed `env.*` reference.

### 7. Tests
- `vitest.config.ts`: add `miniflare: { bindings: { ENCRYPTION_KEY: "test-encryption-key" } }` to `cloudflareTest({...})`. Verified: the plugin reads bindings only from wrangler.jsonc (`vars` has just FAKE_SMS) and never `.dev.vars`; no existing test uses `ENCRYPTION_KEY`, which is why this never surfaced.
- New `test/provider-credentials.test.ts` (follow `test/templates-api.test.ts` harness: inline DDL for `provider_settings` incl. new columns, `app_providers`, `masking_profiles`; wipe in `beforeEach`; clone env with `FAKE_SMS: "false"`):
  1. `upsertGlobalProvider` tri-state: set key → row has ciphertext; upsert with `apiKeyEnc: undefined` keeps it; `null` clears it; `updatedAt` set.
  2. `buildDispatchPlan`: global bulksmsbd key + sender id → 1 entry named `bulksmsbd`; no key → 0 entries and warning text contains "no API key configured"; mimsms with username/senderName/key → entry; masking profile with its own key overrides global (assert via decrypt of the profile vs global, or via FakeSms-free instance `name`).
  3. `invalidateAllAppConfigs`: put `app:config:1`, `app:config:2`, `other:key` in `env.CACHE`; after call the two app keys are gone and `other:key` remains.
- Existing 62 tests must stay green (none reference the removed bindings).

### 8. ADR
`docs/adr/0004-provider-credentials-in-d1.md`, same format as 0003 (Status/Context/Decision/Consequences). Decision: global provider credentials live in `provider_settings`, AES-GCM-encrypted with `ENCRYPTION_KEY`, editable at runtime, `invalidateAllAppConfigs` on save; the five wrangler secrets are removed. Consequences: rotating `ENCRYPTION_KEY` now breaks every stored credential (previously only masking profiles) — no re-encryption tooling; a global save briefly empties the ADR 0002 cache shield.

Also mark this plan in `docs/plans/2026-09-02-provider-credentials-in-d1.md` (copy of this file's Context + Implementation, status line), matching the two existing plan docs.

## Out of scope
- Multiple accounts per provider (rejected shape); per-app overrides remain masking profiles.
- Any `/v1` write API for credentials (admin UI only).
- `ENCRYPTION_KEY` rotation / re-encryption.
- Editing masking profiles in place (still create + delete).

## Verification
1. `npm run typecheck && npm run typecheck:test && npm test` — all green, new file adds ~8 tests.
2. `grep -rn "SMS_API_KEY\|MIMSMS_API_KEY\|MIMSMS_USERNAME\|MIMSMS_SENDER_NAME\|BULKSMSBD_SENDER_ID" src test README.md CONTEXT.md worker-configuration.d.ts .dev.vars` → no hits.
3. `npm run db:migrate:local` applies the squashed `0000_tiny_hercules.sql` cleanly on a fresh local D1.
4. Manual: `npm run dev` boots without the five vars → Admin → Providers shows "API key: not set" → enter bulksmsbd key + sender id, save → status shows "set · updated …" and the input is blank → set `FAKE_SMS=false`, `POST /v1/sms/send` → no "no API key configured" warning → tick "Remove key", save → send again → warning present, provider skipped.
5. `git diff --check` clean; nothing committed unless asked (the tree also holds the uncommitted UI redesign).
