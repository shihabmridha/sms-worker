/** GET / — recent jobs + quick links into the rest of the admin UI. */

import type { Context } from "hono";
import { getDb } from "../../db";
import { listJobs } from "../../db/queries";
import type { AppEnv } from "../../shared/types";
import { ChunkProgress, Empty, PageHeader, Panel, Status } from "../components";
import { appNameMap, dashboardStats } from "../data";
import { readFlash } from "../flash";
import { Layout } from "../layout";
import { adminPath } from "../paths";
import { formatNum, formatTs, shortId } from "../util";

const RECENT_JOBS_LIMIT = 10;

export async function dashboardGet(c: Context<AppEnv>): Promise<Response> {
  const db = getDb(c.env);
  const [jobs, appNames, stats] = await Promise.all([
    listJobs(db, { limit: RECENT_JOBS_LIMIT, offset: 0 }),
    appNameMap(db),
    dashboardStats(db),
  ]);
  const flash = readFlash(c);

  const totalToday = stats.sent24h + stats.failed24h;
  const failedPct = totalToday > 0 ? Math.round((stats.failed24h / totalToday) * 100) : 0;

  return c.html(
    <Layout title="Overview" active="dashboard" flash={flash}>
      <PageHeader eyebrow="OVERVIEW" title="Delivery" />

      <div class="stat-row">
        <div class="stat">
          <p class="stat-label">Sent (24h)</p>
          <p class="stat-value">{formatNum(stats.sent24h)}</p>
          <div class="ratio">
            <span style={`flex:${stats.sent24h}`} />
            <span style={`flex:${stats.failed24h}`} />
          </div>
        </div>
        <div class="stat">
          <p class="stat-label">Failed (24h)</p>
          <p class="stat-value">{formatNum(stats.failed24h)}</p>
          <p class="stat-sub">{failedPct}% of total</p>
        </div>
        <div class="stat">
          <p class="stat-label">Jobs</p>
          <p class="stat-value">
            {formatNum(stats.jobsRunning)} / {formatNum(stats.jobsQueued)}
          </p>
          <p class="stat-sub">running / queued</p>
        </div>
        <div class="stat">
          <p class="stat-label">Active apps</p>
          <p class="stat-value">{formatNum(stats.activeApps)}</p>
        </div>
      </div>

      <Panel
        title="Recent jobs"
        flush
        actions={
          <a class="btn btn-quiet btn-sm" href={adminPath("/jobs")}>
            All jobs →
          </a>
        }
      >
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
    </Layout>,
  );
}
