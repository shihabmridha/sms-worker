/**
 * Small read helpers the admin UI needs that db/queries.ts doesn't already
 * expose. These query the schema tables directly through the same `Db`
 * handle every other query helper takes — src/db itself is untouched.
 */

import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/queries";
import { getGlobalProviders, listApps } from "../db/queries";
import { admins, appProviders } from "../db/schema";
import { PROVIDER_NAMES } from "../shared/types";
import type { ProviderName } from "../shared/types";

/** appId -> app name, for decorating job/message rows with a readable label. */
export async function appNameMap(db: Db): Promise<Map<number, string>> {
  const apps = await listApps(db);
  return new Map(apps.map((a) => [a.id, a.name]));
}

/** Admin row by id. db/queries only exposes lookup by username; the settings
 *  page (change own password) needs the current admin's row by session id. */
export async function getAdminById(db: Db, id: number) {
  const rows = await db.select().from(admins).where(eq(admins.id, id)).limit(1);
  return rows[0];
}

export interface AppProviderRow {
  provider: ProviderName;
  enabled: boolean;
  priority: number;
}

/**
 * One row per known provider for a given app, merging any app-level override
 * with the global default so a provider with no override yet still shows an
 * editable starting value. getAppProviderPlan (db/queries) isn't enough here
 * — it only returns the already-resolved, enabled-only dispatch order, not
 * the raw (possibly disabled) override rows the edit form needs.
 */
export async function getAppProviderRows(db: Db, appId: number): Promise<AppProviderRow[]> {
  const [overrides, globals] = await Promise.all([
    db
      .select({
        provider: appProviders.provider,
        enabled: appProviders.enabled,
        priority: appProviders.priority,
      })
      .from(appProviders)
      .where(eq(appProviders.appId, appId))
      .orderBy(asc(appProviders.provider)),
    getGlobalProviders(db),
  ]);

  const overrideMap = new Map(overrides.map((o) => [o.provider, o]));
  const globalMap = new Map(globals.map((g) => [g.provider, g]));

  return PROVIDER_NAMES.map((provider) => {
    const override = overrideMap.get(provider);
    if (override) return override;
    const global = globalMap.get(provider);
    return { provider, enabled: global?.enabled ?? false, priority: global?.priority ?? 100 };
  });
}

export interface GlobalProviderRow {
  provider: ProviderName;
  enabled: boolean;
  priority: number;
  senderId: string | null;
}

/**
 * One row per known provider, defaulting anything missing from
 * provider_settings (e.g. a fresh install before either row has been saved)
 * so the global settings form always has both providers to edit.
 */
export async function getGlobalProviderRows(db: Db): Promise<GlobalProviderRow[]> {
  const rows = await getGlobalProviders(db);
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return PROVIDER_NAMES.map((provider, index) => {
    const existing = byProvider.get(provider);
    if (existing) return existing;
    return { provider, enabled: false, priority: (index + 1) * 10, senderId: null };
  });
}
