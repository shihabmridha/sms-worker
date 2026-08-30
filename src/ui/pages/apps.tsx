/**
 * GET/POST /apps (list + create) and the /apps/:id detail page: activate
 * toggle, key rotation, per-app provider plan editor, masking profiles, and
 * a read-only template list.
 */

import type { Context } from "hono";
import { getDb } from "../../db";
import {
  createApp,
  createMaskingProfile,
  deleteMaskingProfile,
  getAppById,
  listApps,
  listMaskingProfiles,
  listTemplates,
  rotateAppKey,
  setAppActive,
  upsertAppProvider,
} from "../../db/queries";
import { invalidateAppConfig } from "../../core/plan";
import { encryptSecret, generateApiKey } from "../../shared/crypto";
import { PROVIDER_NAMES } from "../../shared/types";
import type { AppEnv, ProviderName } from "../../shared/types";
import { NotFoundPage } from "../components";
import { getAppProviderRows } from "../data";
import { redirectFlash, readFlash } from "../flash";
import type { Flash } from "../flash";
import { Layout } from "../layout";
import { adminPath } from "../paths";
import { formChecked, formatTs, formStr, parseId, parseIntOr } from "../util";

const PROVIDER_LABELS: Record<ProviderName, string> = {
  bulksmsbd: "BulkSMSBD",
  mimsms: "MimSms",
};

function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(value);
}

function ApiKeyReveal({ appName, backHref, apiKey }: { appName: string; backHref: string; apiKey: string }) {
  return (
    <Layout title="API key" active="apps">
      <h1>API key for {appName}</h1>
      <div class="card">
        <p>
          <strong>This key will never be shown again.</strong> Copy it now and store it somewhere safe — the
          worker only keeps a hash of it.
        </p>
        <div class="key-box">{apiKey}</div>
        <a class="btn btn-primary" href={backHref}>
          Done
        </a>
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------------ */
/* List + create                                                       */
/* ------------------------------------------------------------------ */

export async function appsListGet(c: Context<AppEnv>): Promise<Response> {
  const db = getDb(c.env);
  const apps = await listApps(db);
  const flash = readFlash(c);

  return c.html(
    <Layout title="Apps" active="apps" flash={flash}>
      <h1>Apps</h1>
      {apps.length === 0 ? (
        <p class="muted">No apps registered yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Key prefix</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr>
                <td>
                  <a href={adminPath(`/apps/${app.id}`)}>{app.name}</a>
                </td>
                <td>{app.keyPrefix}</td>
                <td>
                  <span class={`badge ${app.isActive ? "badge-active" : "badge-inactive"}`}>
                    {app.isActive ? "active" : "inactive"}
                  </span>
                </td>
                <td>{formatTs(app.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Register a new app</h2>
      <div class="card">
        <form method="post" action={adminPath("/apps")}>
          <div class="field">
            <label for="name">Name</label>
            <input type="text" id="name" name="name" maxlength={64} required />
          </div>
          <button type="submit" class="btn btn-primary">
            Create app
          </button>
        </form>
      </div>
    </Layout>,
  );
}

export async function appsCreatePost(c: Context<AppEnv>): Promise<Response> {
  const body = await c.req.parseBody();
  const name = formStr(body.name);

  if (name.length < 1 || name.length > 64) {
    return redirectFlash(c, adminPath("/apps"), "App name must be 1-64 characters.", "error");
  }

  const db = getDb(c.env);
  const generated = await generateApiKey();

  let app: { id: number; name: string };
  try {
    app = await createApp(db, { name, keyHash: generated.hash, keyPrefix: generated.prefix });
  } catch {
    return redirectFlash(c, adminPath("/apps"), `An app named "${name}" already exists.`, "error");
  }

  return c.html(
    <ApiKeyReveal appName={app.name} backHref={adminPath(`/apps/${app.id}`)} apiKey={generated.key} />,
  );
}

/* ------------------------------------------------------------------ */
/* Detail                                                               */
/* ------------------------------------------------------------------ */

export async function appDetailGet(c: Context<AppEnv>): Promise<Response> {
  const id = parseId(c.req.param("id"));
  if (id === null) {
    return c.html(<NotFoundPage flash={readFlash(c)} what="App" />, 404);
  }

  const db = getDb(c.env);
  const app = await getAppById(db, id);
  if (!app) {
    return c.html(<NotFoundPage flash={readFlash(c)} what="App" />, 404);
  }

  const [providerRows, profiles, templates] = await Promise.all([
    getAppProviderRows(db, id),
    listMaskingProfiles(db, id),
    listTemplates(db, id),
  ]);
  const flash = readFlash(c);

  return c.html(
    <Layout title={app.name} active="apps" flash={flash}>
      <p>
        <a href={adminPath("/apps")}>Apps</a> / {app.name}
      </p>
      <h1>{app.name}</h1>

      <div class="card">
        <div class="row">
          <div>
            <div class="muted">Status</div>
            <span class={`badge ${app.isActive ? "badge-active" : "badge-inactive"}`}>
              {app.isActive ? "active" : "inactive"}
            </span>
          </div>
          <form method="post" action={adminPath(`/apps/${app.id}/active`)}>
            <input type="hidden" name="active" value={app.isActive ? "false" : "true"} />
            <button type="submit" class="btn">
              {app.isActive ? "Deactivate" : "Activate"}
            </button>
          </form>
          <form
            method="post"
            action={adminPath(`/apps/${app.id}/rotate-key`)}
            onsubmit="return confirm('Rotate this app’s API key? The current key will stop working immediately.')"
          >
            <button type="submit" class="btn btn-danger">
              Rotate key
            </button>
          </form>
        </div>
      </div>

      <h2>Provider plan</h2>
      <div class="card">
        <form method="post" action={adminPath(`/apps/${app.id}/providers`)}>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Enabled</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {providerRows.map((row) => (
                <tr>
                  <td>{PROVIDER_LABELS[row.provider]}</td>
                  <td>
                    <input
                      type="checkbox"
                      name={`${row.provider}_enabled`}
                      value="on"
                      checked={row.enabled}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      name={`${row.provider}_priority`}
                      value={String(row.priority)}
                      style="width:90px"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <button type="submit" class="btn btn-primary">
              Save provider plan
            </button>
          </p>
        </form>
      </div>

      <h2>Masking profiles</h2>
      <div class="card">
        {profiles.length === 0 ? (
          <p class="muted">No masking profiles for this app.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Provider</th>
                <th>Sender ID</th>
                <th>Sender name</th>
                <th>Username</th>
                <th>Key</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr>
                  <td>{profile.label}</td>
                  <td>{PROVIDER_LABELS[profile.provider]}</td>
                  <td>{profile.senderId ?? "—"}</td>
                  <td>{profile.senderName ?? "—"}</td>
                  <td>{profile.username ?? "—"}</td>
                  <td>{profile.apiKeyEnc ? "set" : "—"}</td>
                  <td>
                    <form
                      method="post"
                      action={adminPath(`/apps/${app.id}/masking-profiles/${profile.id}/delete`)}
                      onsubmit="return confirm('Delete this masking profile? This cannot be undone.')"
                    >
                      <button type="submit" class="btn btn-danger">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>Add masking profile</h2>
        <form method="post" action={adminPath(`/apps/${app.id}/masking-profiles`)}>
          <div class="row">
            <div class="field inline-field">
              <label for="mp-provider">Provider</label>
              <select id="mp-provider" name="provider" required>
                {PROVIDER_NAMES.map((p) => (
                  <option value={p}>{PROVIDER_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div class="field inline-field">
              <label for="mp-label">Label</label>
              <input type="text" id="mp-label" name="label" maxlength={32} required />
            </div>
          </div>
          <div class="row">
            <div class="field inline-field">
              <label for="mp-sender-id">Sender ID (bulksmsbd)</label>
              <input type="text" id="mp-sender-id" name="senderId" />
            </div>
            <div class="field inline-field">
              <label for="mp-sender-name">Sender name (mimsms)</label>
              <input type="text" id="mp-sender-name" name="senderName" />
            </div>
            <div class="field inline-field">
              <label for="mp-username">Username (mimsms)</label>
              <input type="text" id="mp-username" name="username" />
            </div>
          </div>
          <div class="field">
            <label for="mp-api-key">API key (optional override)</label>
            <input type="text" id="mp-api-key" name="apiKey" autocomplete="off" />
          </div>
          <button type="submit" class="btn btn-primary">
            Add profile
          </button>
        </form>
      </div>

      <h2>Templates</h2>
      <div class="card">
        {templates.length === 0 ? (
          <p class="muted">No templates for this app.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Body</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr>
                  <td>{tpl.name}</td>
                  <td>{tpl.body}</td>
                  <td>{formatTs(tpl.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>,
  );
}

/* ------------------------------------------------------------------ */
/* Mutations                                                            */
/* ------------------------------------------------------------------ */

async function notFoundOrRedirect(c: Context<AppEnv>, flash?: Flash): Promise<Response> {
  return c.html(<NotFoundPage flash={flash} what="App" />, 404);
}

export async function appActivePost(c: Context<AppEnv>): Promise<Response> {
  const id = parseId(c.req.param("id"));
  if (id === null) return notFoundOrRedirect(c);
  const db = getDb(c.env);
  const app = await getAppById(db, id);
  if (!app) return notFoundOrRedirect(c);

  const body = await c.req.parseBody();
  const desired = formStr(body.active) === "true";
  await setAppActive(db, id, desired);
  return redirectFlash(
    c,
    adminPath(`/apps/${id}`),
    desired ? "App activated." : "App deactivated.",
  );
}

export async function appRotateKeyPost(c: Context<AppEnv>): Promise<Response> {
  const id = parseId(c.req.param("id"));
  if (id === null) return notFoundOrRedirect(c);
  const db = getDb(c.env);
  const app = await getAppById(db, id);
  if (!app) return notFoundOrRedirect(c);

  const generated = await generateApiKey();
  const ok = await rotateAppKey(db, id, generated.hash, generated.prefix);
  if (!ok) return notFoundOrRedirect(c);

  return c.html(
    <ApiKeyReveal appName={app.name} backHref={adminPath(`/apps/${app.id}`)} apiKey={generated.key} />,
  );
}

export async function appProvidersPost(c: Context<AppEnv>): Promise<Response> {
  const id = parseId(c.req.param("id"));
  if (id === null) return notFoundOrRedirect(c);
  const db = getDb(c.env);
  const app = await getAppById(db, id);
  if (!app) return notFoundOrRedirect(c);

  const body = await c.req.parseBody();
  for (const provider of PROVIDER_NAMES) {
    const enabled = formChecked(body[`${provider}_enabled`]);
    const priority = parseIntOr(formStr(body[`${provider}_priority`]), 100);
    await upsertAppProvider(db, { appId: id, provider, enabled, priority });
  }
  await invalidateAppConfig(c.env, id);

  return redirectFlash(c, adminPath(`/apps/${id}`), "Provider plan saved.");
}

export async function appMaskingCreatePost(c: Context<AppEnv>): Promise<Response> {
  const id = parseId(c.req.param("id"));
  if (id === null) return notFoundOrRedirect(c);
  const db = getDb(c.env);
  const app = await getAppById(db, id);
  if (!app) return notFoundOrRedirect(c);

  const body = await c.req.parseBody();
  const providerRaw = formStr(body.provider);
  const label = formStr(body.label);
  const senderId = formStr(body.senderId);
  const senderName = formStr(body.senderName);
  const username = formStr(body.username);
  const apiKey = formStr(body.apiKey);

  if (!isProviderName(providerRaw)) {
    return redirectFlash(c, adminPath(`/apps/${id}`), "Unknown provider.", "error");
  }
  if (label.length < 1 || label.length > 32) {
    return redirectFlash(c, adminPath(`/apps/${id}`), "Label must be 1-32 characters.", "error");
  }

  const apiKeyEnc = apiKey ? await encryptSecret(c.env, apiKey) : null;

  try {
    await createMaskingProfile(db, {
      appId: id,
      provider: providerRaw,
      label,
      senderId: senderId || null,
      senderName: senderName || null,
      username: username || null,
      apiKeyEnc,
    });
  } catch {
    return redirectFlash(
      c,
      adminPath(`/apps/${id}`),
      `A masking profile named "${label}" already exists for ${PROVIDER_LABELS[providerRaw]}.`,
      "error",
    );
  }

  await invalidateAppConfig(c.env, id);
  return redirectFlash(c, adminPath(`/apps/${id}`), "Masking profile added.");
}

export async function appMaskingDeletePost(c: Context<AppEnv>): Promise<Response> {
  const id = parseId(c.req.param("id"));
  const profileId = parseId(c.req.param("profileId"));
  if (id === null || profileId === null) return notFoundOrRedirect(c);
  const db = getDb(c.env);
  const app = await getAppById(db, id);
  if (!app) return notFoundOrRedirect(c);

  const deleted = await deleteMaskingProfile(db, id, profileId);
  if (deleted) {
    await invalidateAppConfig(c.env, id);
  }

  return redirectFlash(
    c,
    adminPath(`/apps/${id}`),
    deleted ? "Masking profile deleted." : "Masking profile not found.",
    deleted ? "success" : "error",
  );
}

