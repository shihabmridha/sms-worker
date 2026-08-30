/** GET / — recent jobs + quick links into the rest of the admin UI. */

import type { Context } from "hono";
import { getDb } from "../../db";
import { listJobs } from "../../db/queries";
import type { AppEnv } from "../../shared/types";
import { appNameMap } from "../data";
import { readFlash } from "../flash";
import { Layout } from "../layout";
import { adminPath } from "../paths";
import { formatTs } from "../util";

const RECENT_JOBS_LIMIT = 10;

export async function dashboardGet(c: Context<AppEnv>): Promise<Response> {
  const db = getDb(c.env);
  const [jobs, appNames] = await Promise.all([
    listJobs(db, { limit: RECENT_JOBS_LIMIT, offset: 0 }),
    appNameMap(db),
  ]);
  const flash = readFlash(c);

  return c.html(
    <Layout title="Dashboard" active="dashboard" flash={flash}>
      <h1>Dashboard</h1>

      <div class="card-grid">
        <a class="card" href={adminPath("/jobs")}>
          Jobs
        </a>
        <a class="card" href={adminPath("/messages")}>
          Messages
        </a>
        <a class="card" href={adminPath("/apps")}>
          Apps
        </a>
        <a class="card" href={adminPath("/providers")}>
          Providers
        </a>
      </div>

      <h2>Recent jobs</h2>
      {jobs.length === 0 ? (
        <p class="muted">No jobs yet.</p>
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
      <p>
        <a href={adminPath("/jobs")}>View all jobs</a>
      </p>
    </Layout>,
  );
}
