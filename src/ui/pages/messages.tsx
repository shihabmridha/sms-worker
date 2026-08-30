/** GET /messages?offset= — recent messages across every app. */

import type { Context } from "hono";
import { getDb } from "../../db";
import { listRecentMessages } from "../../db/queries";
import type { AppEnv } from "../../shared/types";
import { Pagination } from "../components";
import { appNameMap } from "../data";
import { readFlash } from "../flash";
import { Layout } from "../layout";
import { adminPath } from "../paths";
import { formatTs, parseOffset, PAGE_SIZE } from "../util";

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
      <h1>Messages</h1>
      {messages.length === 0 ? (
        <p class="muted">No messages recorded yet.</p>
      ) : (
        <table>
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
                <td>{formatTs(msg.createdAt)}</td>
                <td>{appNames.get(msg.appId) ?? `#${msg.appId}`}</td>
                <td>
                  <a href={adminPath(`/jobs/${msg.jobId}`)}>{msg.jobId}</a>
                </td>
                <td>{msg.recipient}</td>
                <td>{msg.provider ?? "—"}</td>
                <td>{msg.status}</td>
                <td>{msg.reason ?? "—"}</td>
                <td>{msg.trackingId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination basePath={adminPath("/messages")} offset={offset} limit={PAGE_SIZE} hasNext={hasNext} />
    </Layout>,
  );
}
