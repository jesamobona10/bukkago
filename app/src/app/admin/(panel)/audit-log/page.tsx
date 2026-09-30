import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';

import FilterBar from '@/components/admin/FilterBar';
import Pagination from '@/components/admin/Pagination';
import { loadAuditActions, loadAuditLog } from '@/lib/admin/queries';
import { formatDateTime, formatRelativeTime, initials } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Audit log · BukkaGo Admin' };

/** The tables any audited action can target. */
const TARGETS = [
  'vendors',
  'customers',
  'orders',
  'disputes',
  'admin_users',
  'platform_settings',
];

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const [result, actions] = await Promise.all([loadAuditLog(searchParams), loadAuditActions()]);

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Accountability
          </div>
          <h1>Audit log</h1>
          <p>
            Append-only. Every action that touches money, access or account status is written
            here in the same transaction as the change itself, with the reason the admin gave.
          </p>
        </div>
        <div className="admin-head-actions">
          <span className="review-count">{result.total} ENTRIES</span>
        </div>
      </div>

      <section className="panel">
        <header>
          <h2>Entries</h2>
        </header>

        <FilterBar
          searchPlaceholder="Search reason or target id…"
          selects={[
            {
              key: 'action',
              label: 'Action',
              options: [
                { value: 'all', label: 'Any action' },
                ...actions.map((action) => ({ value: action, label: action })),
              ],
            },
            {
              key: 'target',
              label: 'Table',
              options: [
                { value: 'all', label: 'Any table' },
                ...TARGETS.map((target) => ({ value: target, label: target })),
              ],
            },
          ]}
        />

        {result.rows.length === 0 ? (
          <div className="empty-note">
            <b>No entries match</b>
            {result.filters.term || result.filters.action || result.filters.target
              ? 'Try clearing the filters.'
              : 'No admin has taken an audited action yet.'}
          </div>
        ) : (
          <div className="audit-list">
            {result.rows.map((entry) => {
              const changed = diffKeys(entry.before_state, entry.after_state);
              return (
                <details key={entry.id} className="audit-entry">
                  <summary>
                    <div className="cell-identity">
                      <span className="mini-avatar">
                        {initials(entry.admin?.email ?? '?')}
                      </span>
                      <div>
                        <b>
                          {entry.admin?.email ?? 'Unknown admin'}
                          <span className="action-tag">{entry.action}</span>
                        </b>
                        <small>
                          {entry.target_table}
                          {entry.target_id ? ` #${entry.target_id}` : ''} ·{' '}
                          {changed.length > 0
                            ? changed.join(', ')
                            : 'no field changes recorded'}
                        </small>
                      </div>
                    </div>
                    <time title={formatDateTime(entry.created_at)}>
                      {formatRelativeTime(entry.created_at)}
                    </time>
                    <ChevronRight size={12} className="chevron" />
                  </summary>

                  <div className="audit-detail">
                    {entry.reason ? (
                      <p className="quote">
                        <b>Reason given</b>
                        {entry.reason}
                      </p>
                    ) : (
                      <p className="muted">No reason was recorded for this action.</p>
                    )}

                    <div className="audit-diff">
                      <div>
                        <b>Before</b>
                        <pre className="code-block">
                          {entry.before_state
                            ? JSON.stringify(entry.before_state, null, 2)
                            : '—'}
                        </pre>
                      </div>
                      <div>
                        <b>After</b>
                        <pre className="code-block">
                          {entry.after_state
                            ? JSON.stringify(entry.after_state, null, 2)
                            : '—'}
                        </pre>
                      </div>
                    </div>

                    <dl className="detail-list">
                      <div>
                        <dt>Action</dt>
                        <dd className="mono">{entry.action}</dd>
                      </div>
                      <div>
                        <dt>Target</dt>
                        <dd className="mono">
                          {entry.target_table}#{entry.target_id}
                        </dd>
                      </div>
                      <div>
                        <dt>Admin</dt>
                        <dd>{entry.admin?.email ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>When</dt>
                        <dd>{formatDateTime(entry.created_at)}</dd>
                      </div>
                    </dl>
                  </div>
                </details>
              );
            })}
          </div>
        )}

        <Pagination
          page={result.page}
          pages={result.pages}
          total={result.total}
          pageSize={result.pageSize}
          label="entries"
          searchParams={searchParams}
        />
      </section>
    </>
  );
}

/** Which keys actually changed, so the collapsed row says something useful. */
function diffKeys(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): string[] {
  if (!before || !after) return [];
  return Object.keys(after).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])
  );
}
