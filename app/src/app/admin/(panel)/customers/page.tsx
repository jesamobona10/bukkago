import type { Metadata } from 'next';
import Link from 'next/link';
import { Users } from 'lucide-react';

import FilterBar from '@/components/admin/FilterBar';
import Pagination from '@/components/admin/Pagination';
import { loadCustomers } from '@/lib/admin/queries';
import { formatDate, initials } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customers · BukkaGo Admin' };

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const result = await loadCustomers(searchParams);
  const banned = result.filters.bannedOnly;

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Customer management
          </div>
          <h1>Customers</h1>
          <p>
            Order history per account, and the ban list. Banning blocks new orders and is
            recorded in the audit log.
          </p>
        </div>
        <div className="admin-head-actions">
          <span className="review-count">{result.total} CUSTOMERS</span>
        </div>
      </div>

      <section className="panel">
        <header>
          <h2>{banned ? 'Banned customers' : 'All customers'}</h2>
        </header>

        <FilterBar
          searchPlaceholder="Search by name…"
          selects={[
            {
              key: 'banned',
              label: 'Show',
              options: [
                { value: 'all', label: 'Everyone' },
                { value: '1', label: 'Banned only' },
              ],
            },
          ]}
        />

        {result.rows.length === 0 ? (
          <div className="empty-note">
            <b>No customers match</b>
            {result.filters.term || result.filters.bannedOnly
              ? 'Try clearing the filters.'
              : 'No customer accounts yet.'}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.rows.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="cell-identity">
                        <span className="mini-avatar">
                          {initials(customer.name ?? customer.id)}
                        </span>
                        <Link href={`/admin/customers/${customer.id}`} className="cell-link">
                          {customer.name ?? 'Unnamed customer'}
                        </Link>
                      </div>
                    </td>
                    <td>{customer.phone ?? '—'}</td>
                    <td>
                      {customer.banned_at ? (
                        <span className="status-pill s-failed">Banned</span>
                      ) : (
                        <span className="status-pill s-paid">Active</span>
                      )}
                    </td>
                    <td className="muted">{formatDate(customer.created_at)}</td>
                    <td className="actions-cell">
                      <Link href={`/admin/customers/${customer.id}`} className="row-link">
                        <Users size={11} />
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
          label="customers"
          searchParams={searchParams}
        />
      </section>
    </>
  );
}
