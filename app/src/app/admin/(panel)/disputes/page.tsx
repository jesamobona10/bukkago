import type { Metadata } from 'next';
import Link from 'next/link';
import { FileWarning } from 'lucide-react';

import FilterBar from '@/components/admin/FilterBar';
import Pagination from '@/components/admin/Pagination';
import { DisputeStatusPill } from '@/components/admin/StatusPill';
import { DISPUTE_STATUSES, loadDisputes } from '@/lib/admin/queries';
import { formatDateTime, formatNaira, formatRelativeTime } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Disputes · BukkaGo Admin' };

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const result = await loadDisputes(searchParams);
  const openOnly = result.filters.status === 'all' || result.filters.status === 'open';

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Dispute resolution
          </div>
          <h1>Disputes</h1>
          <p>
            Raised by customers, vendors or the system. A dispute has to be closed with
            written notes, so the decision can be explained later.
          </p>
        </div>
        <div className="admin-head-actions">
          <span className="review-count">{result.total} DISPUTES</span>
        </div>
      </div>

      <section className="panel">
        <header>
          <h2>
            {result.filters.status === 'all'
              ? 'All disputes'
              : `${result.filters.status} disputes`}
          </h2>
        </header>

        <FilterBar
          searchPlaceholder="Search description or order number…"
          selects={[
            {
              key: 'status',
              label: 'Status',
              options: [
                { value: 'all', label: 'Any status' },
                ...DISPUTE_STATUSES.map((status) => ({
                  value: status,
                  label: status[0].toUpperCase() + status.slice(1),
                })),
              ],
            },
          ]}
        />

        {result.rows.length === 0 ? (
          <div className="empty-note">
            <b>{openOnly ? 'Nothing waiting' : 'No disputes match'}</b>
            {openOnly
              ? 'No open disputes need a decision right now.'
              : 'Try a different status filter.'}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dispute</th>
                  <th>Order</th>
                  <th>Type</th>
                  <th>Raised by</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Opened</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.rows.map((dispute) => (
                  <tr key={dispute.id}>
                    <td>
                      <Link href={`/admin/disputes/${dispute.id}`} className="cell-link">
                        #{dispute.id}
                      </Link>
                      <small className="clamp">{dispute.description}</small>
                    </td>
                    <td>
                      {dispute.orders ? (
                        <Link href={`/admin/orders/${dispute.orders?.id}`} className="cell-link">
                          #{dispute.orders?.id}
                        </Link>
                      ) : (
                        '—'
                      )}
                      <small>{dispute.orders?.vendors?.name ?? ''}</small>
                    </td>
                    <td>{dispute.dispute_type.replace(/_/g, ' ')}</td>
                    <td>{dispute.raised_by_type}</td>
                    <td>
                      <DisputeStatusPill status={dispute.status} />
                    </td>
                    <td className="num">
                      {dispute.orders
                        ? formatNaira(Number(dispute.orders.total_amount))
                        : '—'}
                    </td>
                    <td className="muted">{formatRelativeTime(dispute.created_at)}</td>
                    <td className="actions-cell">
                      <Link href={`/admin/disputes/${dispute.id}`} className="row-link">
                        <FileWarning size={11} />
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={result.page}
          pages={result.pages}
          total={result.total}
          pageSize={result.pageSize}
          label="disputes"
          searchParams={searchParams}
        />
      </section>
    </>
  );
}
