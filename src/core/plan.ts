/**
 * Dispatch-plan building: which providers, in what order, with which
 * credentials. Shared by the sync send path and the queue consumer.
 *
 * Credential resolution per provider (CONTEXT.md "Masking Profile"):
 *   masking profile (app-owned, D1, api key AES-GCM encrypted)
 *     → global provider settings (D1 sender id) + worker secrets.
 *
 * App config is KV-cached (ADR 0002: the cache is an availability shield —
 * a warm cache lets sends proceed through a D1 outage). D1 stays the source
 * of truth; admin/API mutations call `invalidateAppConfig`.
 */

import type { Db } from "../db/queries";
import { getAppProviderPlan, getGlobalProviders, listMaskingProfiles } from "../db/queries";
import { decryptSecret } from "../shared/crypto";
import { KV_TTL_SECONDS, kvAppConfig } from "../shared/constants";
import type { DispatchPlanEntry, ProviderName } from "../shared/types";
import { BulkSmsBd } from "../sms/bulksmsbd";
import { MimSms } from "../sms/mimsms";
import { FakeSms } from "../sms/fake";

interface CachedProfile {
  provider: ProviderName;
  label: string;
  senderId: string | null;
  senderName: string | null;
  username: string | null;
  apiKeyEnc: string | null;
}

export interface AppDispatchConfig {
  plan: { provider: ProviderName; priority: number }[];
  /** Global (non-secret) sender id per provider, from provider_settings. */
  globalSenderIds: Partial<Record<ProviderName, string | null>>;
  profiles: CachedProfile[];
}

export async function loadAppConfig(env: Env, db: Db, appId: number): Promise<AppDispatchConfig> {
  const key = kvAppConfig(appId);
  const cached = await env.CACHE.get<AppDispatchConfig>(key, "json").catch(() => null);
  if (cached) return cached;

  const [plan, globals, profiles] = await Promise.all([
    getAppProviderPlan(db, appId),
    getGlobalProviders(db),
    listMaskingProfiles(db, appId),
  ]);

  const config: AppDispatchConfig = {
    plan,
    globalSenderIds: Object.fromEntries(globals.map((g) => [g.provider, g.senderId])),
    profiles: profiles.map((p) => ({
      provider: p.provider,
      label: p.label,
      senderId: p.senderId,
      senderName: p.senderName,
      username: p.username,
      apiKeyEnc: p.apiKeyEnc,
    })),
  };

  // Cache write is best-effort: a KV failure must never fail a send.
  await env.CACHE.put(key, JSON.stringify(config), { expirationTtl: KV_TTL_SECONDS }).catch(
    (err: unknown) => {
      console.warn(JSON.stringify({ event: "app_config_cache_put_failed", appId, error: String(err) }));
    },
  );
  return config;
}

export async function invalidateAppConfig(env: Env, appId: number): Promise<void> {
  await env.CACHE.delete(kvAppConfig(appId)).catch((err: unknown) => {
    console.warn(JSON.stringify({ event: "app_config_cache_delete_failed", appId, error: String(err) }));
  });
}

export interface BuiltPlan {
  entries: DispatchPlanEntry[];
  /** Non-fatal resolution notes (e.g. masking label matched no profile). */
  warnings: string[];
}

export async function buildDispatchPlan(
  env: Env,
  db: Db,
  appId: number,
  maskingLabel?: string,
): Promise<BuiltPlan> {
  if (env.FAKE_SMS === "true") {
    return { entries: [{ provider: new FakeSms() }], warnings: [] };
  }

  const config = await loadAppConfig(env, db, appId);
  const warnings: string[] = [];
  const entries: DispatchPlanEntry[] = [];
  let maskingMatched = false;

  for (const item of config.plan) {
    const profile = maskingLabel
      ? config.profiles.find((p) => p.provider === item.provider && p.label === maskingLabel)
      : undefined;
    if (profile) maskingMatched = true;

    const apiKey = profile?.apiKeyEnc
      ? await decryptSecret(env, profile.apiKeyEnc)
      : item.provider === "bulksmsbd"
        ? env.SMS_API_KEY
        : env.MIMSMS_API_KEY;
    if (!apiKey) {
      // Matches acadion: a provider without credentials is silently omitted
      // from the chain rather than failing the whole dispatch.
      continue;
    }

    try {
      if (item.provider === "bulksmsbd") {
        const senderId =
          profile?.senderId ?? config.globalSenderIds.bulksmsbd ?? env.BULKSMSBD_SENDER_ID;
        if (!senderId) {
          warnings.push("bulksmsbd omitted: no sender id configured");
          continue;
        }
        entries.push({ provider: new BulkSmsBd({ apiKey, senderId }) });
      } else {
        const username = profile?.username ?? env.MIMSMS_USERNAME;
        const senderName = profile?.senderName ?? env.MIMSMS_SENDER_NAME;
        if (!username || !senderName) {
          warnings.push("mimsms omitted: username/senderName not configured");
          continue;
        }
        entries.push({ provider: new MimSms({ apiKey, username, senderName }) });
      }
    } catch (err) {
      warnings.push(`${item.provider} omitted: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (maskingLabel && !maskingMatched) {
    warnings.push(`masking profile "${maskingLabel}" matched no provider; using global credentials`);
  }
  return { entries, warnings };
}
