# Context — SMS Worker

Glossary of the domain language for this service. Terms here are canonical;
code, API fields, and UI labels use these words.

## Terms

- **App** — An external service registered with the worker (e.g. the acadion
  backend). Authenticates with an API Key. Owns its provider preferences,
  templates, masking profiles, and send history.
- **Admin** — A human operator who logs into the worker's UI to manage apps,
  providers, and view history.
- **API Key** — Opaque bearer token (`sk_...`) issued once at App
  registration; only its hash is stored. Identifies and authenticates an App.
  Rotation and deactivation take effect immediately when D1 is reachable;
  during a D1 outage the last cached auth verdict (≤ 300 s old) is used.
- **Provider** — An external SMS gateway the worker can dispatch through.
  Currently `bulksmsbd` and `mimsms`.
- **Priority** — Per-App ordering of enabled Providers. Dispatch tries
  Providers in priority order.
- **Masking Profile** — A per-App override of a Provider's credentials and
  sender identity (sender id/name, API key), used when an App has bought SMS
  masking from a Provider. Absent a profile, the global Provider credentials
  (encrypted in D1, managed at Admin → Providers) are used.
- **Send** — A synchronous dispatch request: one message (or per-recipient
  messages), processed inline in the HTTP request, immediate result.
- **Job** — An asynchronous bulk dispatch. Accepted with `202 + jobId`,
  payload parked in R2, work performed by the queue consumer. Split into
  Chunks.
- **Chunk** — A slice of a Job's recipients; the unit of queue delivery,
  retry, and idempotency. A redelivered Chunk already marked done is skipped.
- **Dispatch** — The provider-failover loop: try each enabled Provider in
  Priority order until a recipient is accepted. At-least-once by design: an
  ambiguous transport failure falls through to the next Provider.
- **Message** — The per-recipient history record of one attempted delivery:
  recipient (as the caller sent it), Provider used, status, reason, tracking
  id, timestamps.
- **Tracking ID** — The Provider's own id for an accepted message
  (`message_id` / `trackingId`), stored when available.
- **Template** — App-owned stored message text containing `%PLACEHOLDER%`
  tokens, rendered per recipient when a Send or Job references it by id. A
  placeholder with no supplied variable renders as an empty string.
- **Recipient** — A phone number as supplied by the App. Validated with
  `^\+?[0-9]{11,14}$`; never normalized centrally — each Provider adapts the
  number to its own wire format (MimSms requires `880...`).

## Statuses

- **Message status**: `sent` | `failed`.
- **Job status**: `queued` | `running` | `completed` | `completed_with_errors`
  | `failed`.
