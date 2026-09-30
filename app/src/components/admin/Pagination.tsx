import Link from 'next/link';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * A window of pages around the current one. Rendering every page would produce an unbounded
 * link list once the audit log passes a few thousand rows.
 */
function windowAround(page: number, pages: number, span = 2): number[] {
  const start = Math.max(1, Math.min(page - span, pages - span * 2));
  const end = Math.min(pages, Math.max(page + span, span * 2 + 1));
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
}

type Props = {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  label: string;
  /** The page's own search params, so paging keeps whatever filters are active. */
  searchParams: SearchParams;
};

export default function Pagination({
  page,
  pages,
  total,
  pageSize,
  label,
  searchParams,
}: Props) {
  if (pages <= 1) {
    return (
      <div className="pagination single">
        <span>
          {total} {label}
        </span>
      </div>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const window = windowAround(page, pages);

  function href(target: number): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === 'page') continue;
      const single = first(value);
      if (single) params.set(key, single);
    }
    params.set('page', String(target));
    return `?${params.toString()}`;
  }

  return (
    <div className="pagination">
      <span>
        {from}–{to} of {total} {label}
      </span>

      <div className="pagination-links">
        {page > 1 ? (
          <Link href={href(page - 1)}>Previous</Link>
        ) : (
          <span className="disabled">Previous</span>
        )}

        {window[0] > 1 ? <i>…</i> : null}

        {window.map((target) =>
          target === page ? (
            <span key={target} className="current">
              {target}
            </span>
          ) : (
            <Link key={target} href={href(target)}>
              {target}
            </Link>
          )
        )}

        {window[window.length - 1] < pages ? <i>…</i> : null}

        {page < pages ? (
          <Link href={href(page + 1)}>Next</Link>
        ) : (
          <span className="disabled">Next</span>
        )}
      </div>
    </div>
  );
}
