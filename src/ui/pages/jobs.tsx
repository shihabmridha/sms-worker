/** GET /jobs (paginated list) and GET /jobs/:id (detail + its messages, paginated). */

import type { Context } from "hono";
import { getDb } from "../../db";
import { getJob, listJobs, listMessagesByJob } from "../../db/queries";
import type { AppEnv } from "../../shared/types";
import { Breadcrumb, ChunkProgress, Empty, Kv, NotFoundPage, PageHeader, Pagination, Panel, Status } from "../components";
import { appNameMap } from "../data";
import { readFlash } from "../flash";
import { Layout } from "../layout";
import { adminPath } from "../paths";
import { formatNum, formatTs, PAGE_SIZE, parseOffset, shortId } from "../util";

export async function jobsListGet(c: Context<AppEnv>): Promise<Response> {
  const db = getDb(c.env);
  const offset = parseOffset(c.req.query("offset"));
  const [rows, appNames] = await Promise.all([
    listJobs(db, { limit: PAGE_SIZE + 1, offset }),
    appNameMap(db),
  ]);
  const hasNext = rows.length > PAGE_SIZE;
  const jobs = rows.slice(0, PAGE_SIZE);
  const flash = readFlash(c);

  return c.html(
    <Layout title="Jobs" active="jobs" flash={flash}>
      <PageHeader eyebrow="JOBS" title="Jobs" />

      <Panel flush>
        {jobs.length === 0 ? (
          <Empty title="No jobs yet." hint="POST /v1/sms/jobs" />
        ) : (
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>App</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th class="num">Sent</th>
                  <th class="num">Failed</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr>
                    <td>
                      <a class="mono row-link" href={adminPath(`/jobs/${job.id}`)} title={job.id}>
                        {shortId(job.id)}…
                      </a>
                    </td>
                    <td>{appNames.get(job.appId) ?? `#${job.appId}`}</td>
                    <td>{job.kind}</td>
                    <td>
                      <Status value={job.status} />
                    </td>
                    <td>
                      <ChunkProgress done={job.chunksDone} total={job.chunkCount} />
                    </td>
                    <td class="num">{formatNum(job.sent)}</td>
                    <td class="num">{formatNum(job.failed)}</td>
                    <td class="mono">{formatTs(job.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Pagination basePath={adminPath("/jobs")} offset={offset} limit={PAGE_SIZE} hasNext={hasNext} />
    </Layout>,
  );
}

export async function jobDetailGet(c: Context<AppEnv>): Promise<Response> {
  const db = getDb(c.env);
  const jobId = c.req.param("id");
  const job = jobId ? await getJob(db, jobId) : undefined;

  if (!job) {
    return c.html(<NotFoundPage flash={readFlash(c)} what="Job" />, 404);
  }

  const offset = parseOffset(c.req.query("offset"));
  const [rows, appNames] = await Promise.all([
    listMessagesByJob(db, job.id, { limit: PAGE_SIZE + 1, offset }),
    appNameMap(db),
  ]);
  const hasNext = rows.length > PAGE_SIZE;
  const messages = rows.slice(0, PAGE_SIZE);
  const flash = readFlash(c);

  const kvItems = [
    { label: "App", value: appNames.get(job.appId) ?? `#${job.appId}` },
    { label: "Kind", value: job.kind },
    { label: "Status", value: <Status value={job.status} /> },
    { label: "Progress", value: <ChunkProgress done={job.chunksDone} total={job.chunkCount} /> },
    {
      label: "Total / Sent / Failed",
      value: (
        <span class="mono num">
          {formatNum(job.total)} / {formatNum(job.sent)} / {formatNum(job.failed)}
        </span>
      ),
    },
    { label: "Created", value: <span class="mono">{formatTs(job.createdAt)}</span> },
    { label: "Completed", value: <span class="mono">{formatTs(job.completedAt)}</span> },
  ];
  if (job.error) {
    kvItems.push({ label: "Error", value: job.error });
  }
  if (job.templateId !== null && job.templateId !== undefined) {
    kvItems.push({ label: "Template id", value: <span class="mono">{job.templateId}</span> });
  }

  return c.html(
    <Layout title={`Job ${shortId(job.id)}`} active="jobs" flash={flash}>
      <Breadcrumb items={[{ label: "Jobs", href: adminPath("/jobs") }, { label: shortId(job.id) }]} />
      <PageHeader eyebrow="JOB" title={shortId(job.id)} />

      <Panel>
        <Kv items={kvItems} />
      </Panel>

      <Panel title="Messages" flush>
        {messages.length === 0 ? (
          <Empty title="No messages recorded for this job yet." />
        ) : (
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>Time</th>
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
      <Pagination
        basePath={adminPath(`/jobs/${job.id}`)}
        offset={offset}
        limit={PAGE_SIZE}
        hasNext={hasNext}
      />
    </Layout>,
  );
}
