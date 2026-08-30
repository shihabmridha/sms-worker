/** Small reusable JSX bits shared across pages. */

import type { Flash } from "./flash";
import { Layout } from "./layout";

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
        <a href={`${basePath}?offset=${prevOffset}`}>Previous</a>
      ) : (
        <span class="muted">Previous</span>
      )}
      {hasNext ? (
        <a href={`${basePath}?offset=${offset + limit}`}>Next</a>
      ) : (
        <span class="muted">Next</span>
      )}
    </div>
  );
}

export function NotFoundPage({ flash, what }: { flash?: Flash; what?: string }) {
  return (
    <Layout title="Not found" flash={flash}>
      <h1>Not found</h1>
      <p class="muted">{what ?? "The requested resource"} could not be found.</p>
    </Layout>
  );
}
