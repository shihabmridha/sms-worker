# Fix plan — code-review remarks of 2026-08-31

Status: all four remarks **validated** (each reproduced or traced first-hand, not
just taken from the reviewer). Ordered by recommended execution order, not by
priority label: #2 is a two-minute unblocker, #1 is the real security fix.

Validation summary

| # | Remark | Verdict | Evidence checked |
|---|--------|---------|------------------|
| 2 | `drizzle-kit` downgraded 0.31.10 → 0.18.1, `db:generate` broken | confirmed | `npm run db:generate` → `error: unknown command 'generate'`, exit 1; `node_modules/drizzle-kit` is 0.18.1; `drizzle.config.ts` uses `dialect`/`defineConfig` which 0.18 doesn't know |
| 1 | Rotate/deactivate never invalidate the KV auth cache | confirmed | `src/api/auth.ts:32` uses the KV hit with no D1 re-check; `appActivePost`/`appRotateKeyPost` (`src/ui/pages/apps.tsx:385-415`) only write D1; no `CACHE.delete(kvAppByKeyHash(...))` anywhere; UI promises "will stop working immediately" (`apps.tsx:184`) |
| 3 | Body cap only enforced via `Content-Length`; `/sms/send` unbounded | confirmed | `src/api/sms.ts:242-248` guard is skipped when header absent/NaN; `/sms/send` (`sms.ts:110-114`) reads the body with no guard; no `hono/body-limit` anywhere in `src/` |
| 4 | Emoji segments understated (code points vs UTF-16 units) | confirmed | `src/ui/util.ts:87` uses `Array.from(body).length` for UCS-2; 70×😀 → 1 segment, correct is 3. Display-only (`components.tsx:125` → template preview) — no server-side segment logic exists |

Not on disk: `docs/adr/` (README cites ADR 0001/0002; only inline code comments
reference them). Nothing written accepts the revocation staleness window.

---

## 1. Immediate API-key revocation (P1)

### Problem
`authMiddleware` is KV-first: on a warm `app:key:<sha256>` entry it never asks
D1, so a rotated or deactivated key keeps working for up to `KV_TTL_SECONDS`
(300 s). Neither mutation touches KV. On top of that, even a `KV.delete` is
only eventually consistent (global propagation ≤ 60 s), so "delete on mutate"
alone cannot honour the UI's "immediately".

### Design
Invert the read order while keeping ADR 0002's intent (sends survive a D1
outage): **D1 is authoritative when reachable; KV is the outage fallback.**

```
hash = sha256(token)
try   row = D1 getAppByKeyHash(hash)          // fresh truth
      if !row            -> 401
      authed = row; refresh KV only on miss (see cost note)
catch (D1 error)
      authed = KV.get(app:key:hash)           // shield
      if !authed         -> 503 (unchanged)
if !authed.isActive      -> 403
```

Plus mutation-side cache purge so the *fallback* path can't resurrect a revoked
key during an outage:

- `appRotateKeyPost`: `CACHE.delete(kvAppByKeyHash(app.keyHash))` using the
  **old** hash (already in scope via `getAppById`). Do it before/with the D1
  update, awaited (not `waitUntil`) so the response implies completion.
- `appActivePost` (deactivate): `CACHE.put(kvAppByKeyHash(app.keyHash),
  {...,isActive:false}, {expirationTtl})` — overwrite rather than delete, so an
  outage-time request gets 403 (correct) instead of 503. On re-activate, delete
  or overwrite with `isActive:true`.
- Extract a helper in `src/core/` (next to `invalidateAppConfig`) e.g.
  `invalidateAppAuth(env, keyHash)` / `writeAppAuth(env, keyHash, authed)`,
  with the same swallow-and-log error style.

Cost/latency (Workers Free): +1 D1 point read per API request (D1 free tier is
millions of rows read/day; the send path already does several D1 ops — check
the 50-query budget in `src/shared/constants.ts` still holds, it does: +1).
KV reads unchanged (one per request to know whether a refresh is needed) or
drop to zero if you only *write* KV on the D1-success path with a cheap
"write every N minutes" guard — simplest: keep read-then-put-on-miss exactly as
today, just moved after the D1 read. KV **writes** must stay rare (Free tier
1,000/day) — never write-through on every request.

### Files
- `src/api/auth.ts` — reorder; update header comment (ADR 0002 still holds:
  outage → cache; healthy → D1).
- `src/ui/pages/apps.tsx` — `appActivePost`, `appRotateKeyPost` call the new helper.
- `src/core/plan.ts` or new `src/core/auth-cache.ts` — helper(s).
- `README.md` line 93 — "instantly via the UI paths that invalidate" becomes
  true for auth; keep the 5-minute note for provider config only.
- CONTEXT.md — one line under **API Key**: rotation/deactivation is immediate
  when D1 is reachable; during a D1 outage the last cached verdict (≤300 s) is
  used. Consider writing this as `docs/adr/0003-auth-d1-first.md` and
  recreating 0001/0002 from the code comments while at it.

### Verify
- Local (`wrangler dev`): create app → send OK → rotate → old key 401 on the
  very next request, new key 200. Deactivate → 403 next request. Re-activate → 200.
- Simulate D1 outage (e.g. temporarily throw in `getAppByKeyHash`): warm key
  still 200, rotated key (KV purged) → 503, deactivated key (KV overwritten) → 403.

### Alternative considered (not recommended)
Keep KV-first, purge on mutate, change UI text to "within about a minute".
Cheaper by one D1 read, but leaves a ≤60 s window on a security control and
the D1 read is well within budget.

---

## 2. Restore drizzle-kit (P1, trivial)

### Problem
Working-tree diff: `"drizzle-kit": "^0.31.10"` → `"^0.18.1"` (+ `@types/node`
added). 0.18.x predates `drizzle-kit generate`, `dialect:`, and `defineConfig`.
No comment or commit explains the change; `npm run typecheck` didn't catch it
because `drizzle.config.ts` is outside `tsconfig.json`'s `include`.

### Fix
1. `npm i -D drizzle-kit@^0.31.10` (or latest 0.31.x) — regenerates the lock.
2. Decide on `@types/node`: keep only if something imports `node:*` or
   `process` (`grep -rn "node:\|process\." src drizzle.config.ts`); otherwise
   drop it to keep the diff minimal. If kept, make sure `tsconfig` `types`
   doesn't now pull Node globals into Worker code unintentionally.
3. Add `drizzle.config.ts` to typechecking so config-shape drift fails CI:
   either add it to `tsconfig.json` `include`, or a `tsconfig.tools.json` +
   `"typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.tools.json"`.
4. Verify: `npm run db:generate` → "No schema changes, nothing to migrate"
   and `git status` shows no new files under `drizzle/`.

If the downgrade was intentional (e.g. an agent "fixed" a transient install
error), say so and choose a version ≥ 0.20 that matches the journal version 7
already in `drizzle/meta/_journal.json`; 0.31.10 is the known-good one.

---

## 3. Enforce body limits while reading (P2)

### Problem
`/sms/jobs` trusts `Content-Length` (skipped if absent, NaN, or spoofed small);
`/sms/send` has no cap at all. Both are behind API-key auth, so this is
authenticated abuse / accidental overload, not an open DoS — but Workers has
128 MB isolate memory and Cloudflare only stops request bodies at 100 MB on
Free/Pro, so a single bad client can OOM the Worker for everyone.

### Fix
1. Use Hono's streaming limiter, `bodyLimit` from `hono/body-limit`
   (present in hono 4.13.5). It counts bytes as the stream is consumed and
   aborts at the cap independent of headers.
   - `/sms/jobs`: `maxSize: MAX_BODY_BYTES`.
   - `/sms/send`: new constant `MAX_SYNC_BODY_BYTES` — 100 recipients ×
     (~1 KB message + `to` + bounded `vars`) ≈ 128–256 KiB; pick 256 KiB.
   - `onError`: return the API's JSON error shape (`fail(413, "request body too large")`
     semantics) so callers see the same envelope as other errors.
2. Keep the `Content-Length` pre-check as a fast reject (no body read), but it
   is no longer the guard.
3. Close the size-shaped holes that survive a byte cap:
   - `src/api/validate.ts:55-61`: `vars` is cast to `Record<string,string>`
     unchecked — validate values are strings, cap key count (e.g. 20) and value
     length (e.g. `MAX_MESSAGE_LENGTH`), reject anything else with 400.
   - Confirm per-recipient `message` and top-level `message`/template render
     are capped at `MAX_MESSAGE_LENGTH` *before* dispatch (they appear to be;
     add a test).
4. Document the number. Worst-case legitimate `/sms/jobs` payload
   (50 000 recipients × 1 000-char per-recipient messages) is ~50 MB > 25 MiB.
   Either state in README/API docs that large jobs with per-recipient bodies
   must be split (recommended — 25 MiB already leaves headroom for the JSON
   parse + R2 put inside 128 MB), or raise the cap and re-check memory. Add a
   comment on `MAX_BODY_BYTES` with the reasoning.

### Files
`src/api/sms.ts`, `src/api/validate.ts`, `src/shared/constants.ts`, README.

### Verify
- `curl -H 'Transfer-Encoding: chunked'` with a 30 MB generated body and no
  `Content-Length` to `/sms/jobs` → 413, Worker memory flat.
- 1 MB body to `/sms/send` → 413. Normal 100-recipient send → 200.
- `Content-Length: 10` with a 30 MB body → 413 (streaming limiter catches it).

---

## 4. Correct UCS-2 segment math (P2, display-only)

### Problem
`smsSegments` (`src/ui/util.ts:67-89`) measures UCS-2 length in code points.
SMS UCS-2 is UTF-16: astral characters (emoji) are 2 units. 36×😀 shows 1
segment (really 2), 70×😀 shows 1 (really 3). Only caller is the admin
template preview (`src/ui/components.tsx:125`); nothing server-side counts
segments, so there is no billing/routing impact.

### Fix
In the UCS-2 branch use UTF-16 code units: `const units = body.length;
segments = units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67)`. Keep
`chars` (code points) for the "N chars" label if you like, or return
`{ chars, units, segments, encoding }` and show units when they differ.
GSM-7 branch (incl. 2-septet extension chars) is already correct — leave it.

### Verify (table, put in a unit test)
| input | expect |
|---|---|
| 160×`a` | 1 / GSM-7 |
| 161×`a` | 2 / GSM-7 |
| 80×`€` | 1 / GSM-7 (extension = 2 septets) |
| 81×`€` | 2 / GSM-7 |
| 35×😀 | 1 / UCS-2 |
| 36×😀 | 2 / UCS-2 |
| 70×😀 | 3 / UCS-2 |

---

## Cross-cutting: add a test harness (recommended, small)

There are no tests or lint scripts, so none of the above gets regression
coverage. Minimal, Workers-native setup:

- `vitest` + `@cloudflare/vitest-pool-workers` (runs inside workerd with real
  KV/D1 bindings from `wrangler.jsonc`).
- Tests: `smsSegments` table (#4); `validate.ts` vars/size rules (#3);
  `authMiddleware` D1-first + fallback + revocation (#1) using the pool's
  D1/KV; a `bodyLimit` 413 test with a streamed body (#3).
- `"test": "vitest run"` in package.json; run it alongside `typecheck`.

## Open item (not a defect today)
Send endpoints have no caller-facing idempotency key; a retried ambiguous
request resends. The API contract doesn't promise idempotency, so leave it,
but note it in README's at-least-once section so callers aren't surprised.
