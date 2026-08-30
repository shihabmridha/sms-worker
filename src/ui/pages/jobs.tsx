/** GET /jobs (paginated list) and GET /jobs/:id (detail + its messages, paginated). */

import type { Context } from "hono";
import { getDb } from "../../db";
import { getJob, listJobs, listMessagesByJob } from "../../db/queries";
import type { AppEnv } from "../../shared/types";
import { NotFoundPage, Pagination } from "../components";
import { appNameMap } from "../data";
import { readFlash } from "../flash";
import { Layout } from "../layout";
import { adminPath } from "../paths";
import { formatTs, parseOffset, PAGE_SIZE } from "../util";

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
      <h1>Jobs</h1>
      {jobs.length === 0 ? (
        <p class="muted">No jobs found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>App</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Total / Sent / Failed</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr>
                <td>
                  <a href={adminPath(`/jobs/${job.id}`)}>{job.id}</a>
                </td>
                <td>{appNames.get(job.appId) ?? `#${job.appId}`}</td>
                <td>{job.kind}</td>
                <td>{job.status}</td>
                <td>
                  {job.total} / {job.sent} / {job.failed}
                </td>
                <td>{formatTs(job.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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

  return c.html(
    <Layout title={`Job ${job.id}`} active="jobs" flash={flash}>
      <p>
        <a href={adminPath("/jobs")}>Jobs</a> / {job.id}
      </p>
      <h1>Job {job.id}</h1>

      <div class="card">
        <div class="row">
          <div>
            <div class="muted">App</div>
            <div>{appNames.get(job.appId) ?? `#${job.appId}`}</div>
          </div>
          <div>
            <div class="muted">Kind</div>
            <div>{job.kind}</div>
          </div>
          <div>
            <div class="muted">Status</div>
            <div>{job.status}</div>
          </div>
          <div>
            <div class="muted">Total / Sent / Failed</div>
            <div>
              {job.total} / {job.sent} / {job.failed}
            </div>
          </div>
          <div>
            <div class="muted">Chunks</div>
            <div>
              {job.chunksDone} / {job.chunkCount}
            </div>
          </div>
          <div>
            <div class="muted">Created</div>
            <div>{formatTs(job.createdAt)}</div>
          </div>
          <div>
            <div class="muted">Completed</div>
            <div>{formatTs(job.completedAt)}</div>
          </div>
        </div>
        {job.error ? (
          <p>
            <span class="muted">Error:</span> {job.error}
          </p>
        ) : null}
      </div>

      <h2>Messages</h2>
      {messages.length === 0 ? (
        <p class="muted">No messages recorded for this job yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Tracking ID</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((msg) => (
              <tr>
                <td>{msg.recipient}</td>
                <td>{msg.provider ?? "—"}</td>
                <td>{msg.status}</td>
                <td>{msg.reason ?? "—"}</td>
                <td>{msg.trackingId ?? "—"}</td>
                <td>{formatTs(msg.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination
        basePath={adminPath(`/jobs/${job.id}`)}
        offset={offset}
        limit={PAGE_SIZE}
        hasNext={hasNext}
      />
    </Layout>,
  );
}
