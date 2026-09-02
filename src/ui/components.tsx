/** Small reusable JSX bits shared across pages — see DESIGN.md "Components". */

import type { Child } from "hono/jsx";
import type { JobStatus, MessageStatus } from "../shared/types";
import type { Flash } from "./flash";
import { Layout } from "./layout";
import { formatNum, smsSegments } from "./util";

/* ------------------------------------------------------------------ */
/* Page head                                                           */
/* ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: Child;
}) {
  return (
    <div class="page-head">
      <div>
        <p class="eyebrow">{eyebrow}</p>
        <h1 class="page-title">{title}</h1>
        {sub ? <p class="page-sub">{sub}</p> : null}
      </div>
      {actions ? <div class="page-actions">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                                */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  actions,
  flush,
  children,
}: {
  title?: string;
  actions?: Child;
  flush?: boolean;
  children?: Child;
}) {
  return (
    <div class="panel">
      {title || actions ? (
        <div class="panel-head">
          {title ? <p class="panel-title">{title}</p> : <span />}
          {actions ? <div class="panel-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div class={flush ? "panel-body panel-flush" : "panel-body"}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status LED                                                          */
/* ------------------------------------------------------------------ */

type AnyStatus = JobStatus | MessageStatus;

const STATUS_META: Record<AnyStatus, { led: string; label: string }> = {
  sent: { led: "led-accent", label: "Sent" },
  completed: { led: "led-accent", label: "Completed" },
  failed: { led: "led-danger", label: "Failed" },
  completed_with_errors: { led: "led-warn", label: "Completed with errors" },
  queued: { led: "led-amber", label: "Queued" },
  running: { led: "led-accent led-running", label: "Running" },
};

export function Status({ value }: { value: AnyStatus }) {
  const meta = STATUS_META[value];
  return (
    <span class="status">
      <span class={`led ${meta.led}`} />
      {meta.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Chunk progress                                                      */
/* ------------------------------------------------------------------ */

export function ChunkProgress({ done, total }: { done: number; total: number }) {
  const safeTotal = Math.max(0, total);
  const safeDone = Math.max(0, Math.min(done, safeTotal));
  const pct = safeTotal > 0 ? Math.round((safeDone / safeTotal) * 100) : 0;
  // Sync sends have no chunks — a 0/0 track is noise, not information.
  if (safeTotal === 0) return <span class="muted">—</span>;

  return (
    <span style="display:inline-flex;align-items:center;gap:8px">
      {safeTotal > 0 && safeTotal <= 24 ? (
        <span class="chunks chunks-seg">
          {Array.from({ length: safeTotal }, (_, i) => (
            <i class={i < safeDone ? "is-done" : undefined} />
          ))}
        </span>
      ) : (
        <span class="chunks">
          <span class="chunks-fill" style={`width:${pct}%`} />
        </span>
      )}
      <span class="mono num">
        {safeDone}/{safeTotal}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Segment ruler                                                       */
/* ------------------------------------------------------------------ */

export function Segments({ body }: { body: string }) {
  const { chars, units, segments, encoding } = smsSegments(body);
  return (
    <span class="segments mono muted">
      {formatNum(chars)} chars{units !== chars ? <> · {formatNum(units)} units</> : null} · {segments} segment
      {segments === 1 ? "" : "s"} · {encoding}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div class="empty">
      <p>{title}</p>
      {hint ? <p class="mono">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Definition grid                                                     */
/* ------------------------------------------------------------------ */

export function Kv({ items }: { items: { label: string; value: Child }[] }) {
  return (
    <dl class="kv">
      {items.map((item) => (
        <div>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* Breadcrumb                                                          */
/* ------------------------------------------------------------------ */

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav class="breadcrumb">
      {items.map((item, i) => (
        <>
          {i > 0 ? " / " : ""}
          {item.href ? <a href={item.href}>{item.label}</a> : <span>{item.label}</span>}
        </>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export function Pagination({
  basePath,
  offset,
  limit,
  hasNext,
}: {
  basePath: string;
  offset: number;
  limit: number;
  hasNext: boolean;
}) {
  const prevOffset = Math.max(0, offset - limit);
  return (
    <div class="pagination">
      {offset > 0 ? (
        <a class="btn btn-quiet btn-sm" href={`${basePath}?offset=${prevOffset}`}>
          ← Newer
        </a>
      ) : (
        <span class="btn btn-quiet btn-sm muted">← Newer</span>
      )}
      {hasNext ? (
        <a class="btn btn-quiet btn-sm" href={`${basePath}?offset=${offset + limit}`}>
          Older →
        </a>
      ) : (
        <span class="btn btn-quiet btn-sm muted">Older →</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Not found                                                           */
/* ------------------------------------------------------------------ */

export function NotFoundPage({ flash, what }: { flash?: Flash; what?: string }) {
  return (
    <Layout title="Not found" flash={flash}>
      <PageHeader eyebrow="ERROR" title="Not found" />
      <Empty title={`${what ?? "The requested resource"} could not be found.`} />
    </Layout>
  );
}
