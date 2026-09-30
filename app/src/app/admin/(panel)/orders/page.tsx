import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt } from 'lucide-react';

import FilterBar from '@/components/admin/FilterBar';
import Pagination from '@/components/admin/Pagination';
import { StatusPill } from '@/components/admin/StatusPill';
import { loadOrders, ORDER_STATUSES, PAYMENT_STATUSES } from '@/lib/admin/queries';
import { formatNaira, formatRelativeTime } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Orders · BukkaGo Admin' };

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const result = await loadOrders(searchParams);

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Order oversight
          </div>
          <h1>Orders</h1>
          <p>
            Every order on the platform. Search by order number or the customer's pickup
            code.
          </p>
        </div>
        <div className="admin-head-actions">
          <span className="review-count">{result.total} ORDERS</span>
        </div>
      </div>

      <section className="panel">
        <header>
          <h2>All orders</h2>
        </header>

        <FilterBar
          searchPlaceholder="Search order number or pickup code…"
          selects={[
            {
              key: 'status',
              label: 'Status',
              options: [
                { value: 'all', label: 'Any status' },
                ...ORDER_STATUSES.map((status) => ({
                  value: status,
                  label: status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
                })),
              ],
            },
            {
              key: 'payment',
              label: 'Payment',
              options: [
                { value: 'all', label: 'Any' },
                ...PAYMENT_STATUSES.map((status) => ({
                  value: status,
                  label: status[0].toUpperCase() + status.slice(1),
                })),
              ],
            },
          ]}
        />

        {result.rows.length === 0 ? (
          <div className="empty-note">
            <b>No orders match</b>
            {result.filters.term || result.filters.status !== 'all'
              ? 'Try clearing the filters.'
              : 'No orders have been placed yet.'}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Pickup code</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Amount</th>
                  <th>Placed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.rows.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/admin/orders/${order.id}`} className="cell-link">
                        #{order.id}
                      </Link>
                    </td>
                    <td className="mono">{order.pickup_code}</td>
                    <td>{order.vendors?.name ?? '—'}</td>
                    <td>
                      <StatusPill status={order.status} />
                    </td>
                    <td>
                      <StatusPill status={order.payment_status} />
                    </td>
                    <td className="num">{formatNaira(Number(order.total_amount))}</td>
                    <td className="muted">{formatRelativeTime(order.created_at)}</td>
                    <td className="actions-cell">
                      <Link href={`/admin/orders/${order.id}`} className="row-link">
                        <Receipt size={11} />
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
          label="orders"
          searchParams={searchParams}
        />
      </section>
    </>
  );
}
