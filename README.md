# sms-worker

Standalone SMS gateway on Cloudflare Workers. Any backend ("App") registers
once, gets an API key, and sends SMS through a provider-failover pipeline
(BulkSMSBD → MiMSMS by default) with per-recipient history in D1, bulk jobs
via Queues + R2, `%TOKEN%` templating, per-app provider priorities, and
per-app masking profiles (custom sender identity / credentials).

Domain language: [CONTEXT.md](./CONTEXT.md). Key decisions:
[docs/adr/](./docs/adr/).

## Architecture

- **Hono** API (`/v1/*`, bearer `sk_...` keys) + server-rendered **admin UI**
  (`/admin`, session cookie).
- **D1** (drizzle-orm) — apps, providers, masking profiles, templates, jobs,
  chunks, per-recipient message history (90-day retention via nightly cron).
- **Queues** — a bulk job is split into 250-recipient chunks; each queue
  message is only `{jobId, chunkIndex}`; the payload lives in **R2**
  (ADR 0001). Failed chunks retry with exponential backoff, then dead-letter
  to `sms-dlq` where they're recorded as failed.
- **KV** — cache for app auth + provider config, so sends survive a D1
  outage (ADR 0002: sending outranks record-keeping).

## Setup

```sh
npm install

# 1. Create resources (once)
npx wrangler d1 create sms-worker           # put database_id into wrangler.jsonc
npx wrangler kv namespace create CACHE      # put id into wrangler.jsonc
npx wrangler r2 bucket create sms-worker-payloads
npx wrangler queues create sms-jobs
npx wrangler queues create sms-dlq

# 2. Migrations
npm run db:migrate:local     # local dev
npm run db:migrate:remote    # production D1

# 3. Secrets (production)
npx wrangler secret put ENCRYPTION_KEY           # any long random string
npx wrangler secret put SESSION_SECRET           # any long random string
npx wrangler secret put ADMIN_BOOTSTRAP_PASSWORD

# 4. Run / deploy
npm run dev                  # local (FAKE_SMS=true via .dev.vars)
npm run deploy               # deploys to sms.shihabmridha.com
```

First admin login: username `admin` + the `ADMIN_BOOTSTRAP_PASSWORD` value
(only works while no admin exists; change the password in Settings after).
Register an App in the UI — the API key is shown exactly once.

### 5. Provider credentials

Provider credentials are not worker secrets — after first login, open
Admin → Providers and enter each provider's API key and sender identity
(sender id for BulkSMSBD; username + sender name for MiMSMS). They're stored
AES-GCM-encrypted in D1 (`ENCRYPTION_KEY`) and changes apply immediately.
Local dev runs with `FAKE_SMS=true`, so no credentials are needed; to hit
real providers locally, set `FAKE_SMS=false` in `.dev.vars` and enter
credentials in the UI.

## API

`Authorization: Bearer sk_...` on everything.

```sh
# Sync send (OTPs etc., ≤100 recipients, immediate result)
curl -X POST https://sms.shihabmridha.com/v1/sms/send \
  -H "Authorization: Bearer sk_..." -H "Content-Type: application/json" \
  -d '{"message": "Your code is 1234", "recipients": ["01712345678"]}'

# Bulk job (≤50,000 recipients, queued) — returns 202 {jobId}
curl -X POST https://sms.shihabmridha.com/v1/sms/jobs \
  -H "Authorization: Bearer sk_..." -H "Content-Type: application/json" \
  -d '{"templateId": 1, "recipients": [{"to": "01712345678", "vars": {"NAME": "Rahim"}}]}'

curl https://sms.shihabmridha.com/v1/sms/jobs/<jobId>          # progress
curl https://sms.shihabmridha.com/v1/sms/jobs/<jobId>/messages # per-recipient
```

Also: `/v1/templates` CRUD (`%NAME%` placeholders; missing vars render
empty), `GET|PUT /v1/providers` (per-app enable/priority),
`GET /v1/masking-profiles`. Add `"maskingProfile": "<label>"` to a send/job
to dispatch with that profile's sender identity/credentials.

### Request limits

- `/sms/send`: body ≤ 256 KiB, ≤ 100 recipients.
- `/sms/jobs`: body ≤ 25 MiB, ≤ 50,000 recipients — a job whose per-recipient
  bodies would exceed 25 MiB combined (e.g. 50,000 recipients each near the
  1,000-char message cap) must be split into multiple `/sms/jobs`
  submissions.
- `vars`: at most 20 keys per recipient, each value a string of at most 1,000
  characters.
- An oversized body is rejected before it's read, as `413 {"error": "request
  body too large"}`.

## Notes

- Delivery is **at-least-once** end to end (queue redelivery + provider
  failover); duplicates are preferred over silent loss. See CONTEXT.md
  "Dispatch".
- Phone numbers: `^\+?[0-9]{11,14}$`, stored as given; MiMSMS 880-prefixing
  happens inside its adapter only.
- Sizing constants (chunk 250, sync cap 100, job cap 50k) are tuned for
  **Workers Free** limits — see `src/shared/constants.ts` before raising.
- API key rotation and app activate/deactivate take effect immediately (D1 is
  authoritative for auth — see ADR 0003). Global provider credential saves
  (ADR 0004) and per-app provider/masking changes made through the UI/API
  invalidate app caches (KV) instantly; anything else refreshes within
  5 minutes.
