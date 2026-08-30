/** GET/POST /providers — global (worker-wide) provider defaults. */

import type { Context } from "hono";
import { getDb } from "../../db";
import { upsertGlobalProvider } from "../../db/queries";
import { PROVIDER_NAMES } from "../../shared/types";
import type { AppEnv, ProviderName } from "../../shared/types";
import { getGlobalProviderRows } from "../data";
import { redirectFlash, readFlash } from "../flash";
import { Layout } from "../layout";
import { adminPath } from "../paths";
import { formChecked, formStr, parseIntOr } from "../util";

const PROVIDER_LABELS: Record<ProviderName, string> = {
  bulksmsbd: "BulkSMSBD",
  mimsms: "MimSms",
};

export async function providersGet(c: Context<AppEnv>): Promise<Response> {
  const db = getDb(c.env);
  const rows = await getGlobalProviderRows(db);
  const flash = readFlash(c);

  return c.html(
    <Layout title="Providers" active="providers" flash={flash}>
      <h1>Global provider settings</h1>
      <p class="muted">
        These are the defaults used by apps that have no per-app provider plan. App caches refresh within
        5 minutes of a change here.
      </p>

      <div class="card">
        <form method="post" action={adminPath("/providers")}>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Enabled</th>
                <th>Priority</th>
                <th>Sender ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
                  <td>
                    {row.provider === "bulksmsbd" ? (
                      <input
                        type="text"
                        name={`${row.provider}_senderId`}
                        value={row.senderId ?? ""}
                        placeholder="numeric sender id"
                      />
                    ) : (
                      <span class="muted">not used</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <button type="submit" class="btn btn-primary">
              Save
            </button>
          </p>
        </form>
      </div>
    </Layout>,
  );
}

export async function providersPost(c: Context<AppEnv>): Promise<Response> {
  const db = getDb(c.env);
  const body = await c.req.parseBody();

  for (const provider of PROVIDER_NAMES) {
    const enabled = formChecked(body[`${provider}_enabled`]);
    const priority = parseIntOr(formStr(body[`${provider}_priority`]), 100);
    const senderIdRaw = formStr(body[`${provider}_senderId`]);
    await upsertGlobalProvider(db, {
      provider,
      enabled,
      priority,
      senderId: senderIdRaw || null,
    });
  }

  return redirectFlash(c, adminPath("/providers"), "Global provider settings saved.");
}
