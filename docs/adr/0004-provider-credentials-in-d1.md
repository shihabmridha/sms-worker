# 0004: Global provider credentials live in D1, not worker secrets

Status: accepted (2026-09-02)

## Context

Global provider credentials (`SMS_API_KEY`, `MIMSMS_API_KEY`,
`MIMSMS_USERNAME`, `MIMSMS_SENDER_NAME`, `BULKSMSBD_SENDER_ID`) were worker
secrets, read directly in `buildDispatchPlan`. Rotating or adding a provider
account meant `wrangler secret put` and a deploy — inconsistent with per-App
Masking Profiles, which already store encrypted credentials in D1
(`api_key_enc`, via `encryptSecret`/`decryptSecret`,
`src/shared/crypto.ts:147-165`) and can be edited at runtime.

## Decision

Extend `provider_settings` (one row per provider) with the same encrypted
credential columns Masking Profiles use: `api_key_enc`, `username`,
`sender_name`, `updated_at`, editable at runtime from Admin → Providers.

- `upsertGlobalProvider` writes with tri-state semantics per field:
  `undefined` keeps the existing value, `null` clears it, a string sets it.
- `buildDispatchPlan` resolves each field as `profile?.field ??
  globals[provider]?.field` — Masking Profiles still override global
  credentials field-by-field, unchanged from before.
- Saving from Admin → Providers calls `invalidateAllAppConfigs`, purging
  every `app:config:*` KV cache entry so new credentials take effect on the
  very next dispatch instead of waiting out the cache TTL.
- The five provider worker secrets are removed entirely; `ENCRYPTION_KEY`,
  `SESSION_SECRET`, `ADMIN_BOOTSTRAP_PASSWORD`, `FAKE_SMS` stay, since they
  configure the worker itself rather than a provider account.
- A provider with no API key configured (global or profile) is skipped with
  a warning (`"${provider} omitted: no API key configured (Admin →
  Providers)"`) rather than failing the send; BulkSMSBD without a sender id
  and MiMSMS without a username/sender name are skipped the same way.

## Consequences

- Rotating `ENCRYPTION_KEY` now breaks every stored provider credential, not
  just Masking Profile credentials — there is no re-encryption tooling; a
  rotation requires re-entering every global provider's credentials at
  Admin → Providers afterward.
- A global provider save briefly empties the ADR 0002 cache shield for
  every app at once, so the next dispatch per app pays a fresh D1 read
  instead of hitting a warm cache — acceptable since it's an explicit admin
  action.
- Adding, rotating, or removing a provider credential is now an
  Admin → Providers action, not a deploy.
- A provider missing required configuration degrades to a warning and is
  skipped, rather than the dispatch failing outright.
