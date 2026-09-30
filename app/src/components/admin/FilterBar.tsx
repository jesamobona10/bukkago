'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Search, X } from 'lucide-react';

type Option = { value: string; label: string };

type Props = {
  /** Name of the search input; also the param the server reads. */
  searchKey?: string;
  searchPlaceholder?: string;
  /** Named select filters. Use `all` as the "no filter" value. */
  selects?: { key: string; label: string; options: Option[] }[];
  /** Extra controls rendered to the right of the filters. */
  children?: React.ReactNode;
};

/**
 * Filter state lives entirely in the query string. Changing a filter resets to page 1 —
 * without that, page 4 of a 2-page result set renders as an empty table and looks broken.
 */
export default function FilterBar({
  searchKey = 'q',
  searchPlaceholder = 'Search…',
  selects = [],
  children,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [term, setTerm] = useState(params.get(searchKey) ?? '');

  // Keep the box in step when the user navigates back/forward or follows a filtered link.
  useEffect(() => {
    setTerm(params.get(searchKey) ?? '');
  }, [params, searchKey]);

  function push(overrides: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === '' || value === 'all') next.delete(key);
      else next.set(key, value);
    }
    next.delete('page');
    const query = next.toString();
    startTransition(() => router.replace(query ? `?${query}` : '?', { scroll: false }));
  }

  function clearAll() {
    setTerm('');
    startTransition(() => router.replace('?', { scroll: false }));
  }

  const hasFilters =
    Boolean(params.get(searchKey)) || selects.some((select) => params.get(select.key));

  return (
    <div className="filter-bar">
      <div className="filter-search">
        <Search size={12} />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') push({ [searchKey]: term });
          }}
          onBlur={() => {
            if (term !== (params.get(searchKey) ?? '')) push({ [searchKey]: term });
          }}
          placeholder={searchPlaceholder}
          maxLength={60}
          aria-label={searchPlaceholder}
        />
        {term ? (
          <button type="button" onClick={() => push({ [searchKey]: null })} aria-label="Clear search">
            <X size={11} />
          </button>
        ) : null}
      </div>

      {selects.map((select) => (
        <label key={select.key} className="filter-select">
          <span>{select.label}</span>
          <select
            value={params.get(select.key) ?? 'all'}
            onChange={(e) => push({ [select.key]: e.target.value })}
          >
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      <div className="filter-extra">{children}</div>

      {hasFilters ? (
        <button type="button" className="filter-clear" onClick={clearAll}>
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
