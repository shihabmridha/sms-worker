/** GET /messages?offset= — recent messages across every app. */

import type { Context } from "hono";
import { getDb } from "../../db";
import { listRecentMessages } from "../../db/queries";
import type { AppEnv } from "../../shared/types";
import { Empty, PageHeader, Pagination, Panel, Status } from "../components";
import { appNameMap } from "../data";
import { readFlash } from "../flash";
import { Layout } from "../layout";
import { adminPath } from "../paths";
import { formatTs, PAGE_SIZE, parseOffset, shortId } from "../util";

export async function messagesGet(c: Context<AppEnv>): Promise<Response> {
  const db = getDb(c.env);
  const offset = parseOffset(c.req.query("offset"));
  const [rows, appNames] = await Promise.all([
    listRecentMessages(db, { limit: PAGE_SIZE + 1, offset }),
    appNameMap(db),
  ]);
  const hasNext = rows.length > PAGE_SIZE;
  const messages = rows.slice(0, PAGE_SIZE);
  const flash = readFlash(c);

  return c.html(
    <Layout title="Messages" active="messages" flash={flash}>
      <PageHeader eyebrow="MESSAGES" title="Messages" />

      <Panel flush>
        {messages.length === 0 ? (
          <Empty title="No messages yet." hint="POST /v1/sms/send" />
        ) : (
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>App</th>
                  <th>Job</th>
                  <th>Recipient</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Tracking ID</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr>
                    <td class="mono">{formatTs(msg.createdAt)}</td>
                    <td>{appNames.get(msg.appId) ?? `#${msg.appId}`}</td>
                    <td>
                      <a class="mono row-link" href={adminPath(`/jobs/${msg.jobId}`)} title={msg.jobId}>
                        {shortId(msg.jobId)}…
                      </a>
                    </td>
                    <td class="mono">{msg.recipient}</td>
                    <td>{msg.provider ?? "—"}</td>
                    <td>
                      <Status value={msg.status} />
                    </td>
                    <td class="muted cell-clip" title={msg.reason ?? undefined}>
                      {msg.reason ?? "—"}
                    </td>
                    <td class="mono muted">{msg.trackingId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Pagination basePath={adminPath("/messages")} offset={offset} limit={PAGE_SIZE} hasNext={hasNext} />
    </Layout>,
  );
}
