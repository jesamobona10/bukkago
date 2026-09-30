import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';

import AuditedAction from '@/components/admin/AuditedAction';
import { StatusPill } from '@/components/admin/StatusPill';
import { loadCustomerDetail } from '@/lib/admin/queries';
import { formatDate, formatNaira, initials } from '@/lib/dates';
import { getAdminUser } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customer · BukkaGo Admin' };

type Params = { params: { id: string } };

export default async function CustomerDetailPage({ params }: Params) {
  const detail = await loadCustomerDetail(params.id);

  if (!detail) notFound();

  const admin = await getAdminUser();

  const { customer, banAdmin } = detail;
  const canAct = admin?.role === 'super_admin' || admin?.role === 'support_admin';
  const banned = Boolean(customer.banned_at);

  return (
    <>
      <Link href="/admin/customers" className="back-link">
        <ChevronLeft size={12} />
        All customers
      </Link>

      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Customer
          </div>
          <h1>{customer.name ?? 'Unnamed customer'}</h1>
          <p>
            {customer.phone ?? 'No phone on file'} · joined{' '}
            {formatDate(customer.created_at)}
          </p>
        </div>
        <div className="admin-head-actions">
          {banned ? <span className="status-pill s-failed">Banned</span> : null}
        </div>
      </div>

      {banned ? (
        <div className="banner banner-warn">
          <b>Banned {formatDate(customer.banned_at)}</b>
          <p>
            {customer.banned_reason}
            {banAdmin ? ` — ${banAdmin.email}` : ''}
          </p>
        </div>
      ) : null}

      <div className="kpi-row">
        <div className="kpi">
          <small>ORDERS</small>
          <b>{detail.orderCount}</b>
          <em>All time</em>
        </div>
        <div className="kpi">
          <small>SPEND</small>
          <b>{formatNaira(detail.spend)}</b>
          <em>Paid orders only</em>
        </div>
        <div className="kpi warn">
          <small>NO-SHOWS</small>
          <b>{detail.noShows}</b>
          <em>Orders marked no_show</em>
        </div>
        <div className="kpi warn">
          <small>OPEN DISPUTES</small>
          <b>{detail.openDisputes}</b>
          <em>Raised by this customer</em>
        </div>
      </div>

      <div className="split-grid">
        <section className="panel">
          <header>
            <h2>Details</h2>
          </header>
          <dl className="detail-list">
            <div>
              <dt>Account</dt>
              <dd className="mono">{customer.id}</dd>
            </div>
            <div>
              <dt>Name</dt>
              <dd>{customer.name ?? '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{customer.phone ?? '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{banned ? 'Banned' : 'Active'}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{formatDate(customer.created_at)}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <header>
            <h2>Actions</h2>
          </header>
          <div className="panel-body">
            {!banned ? (
              <AuditedAction
                endpoint={`/api/admin/customers/${customer.id}/ban`}
                args={{ p_customer_id: customer.id }}
                actionLabel="Ban customer"
                confirmLabel="Ban customer"
                tone="danger"
                multilineReason
                reasonPlaceholder="e.g. Three verified no-shows in one week without notice"
                help="Blocks new orders immediately. Orders already placed still run. The customer cannot lift their own ban. Recorded as customer.ban."
                disabled={!canAct}
                disabledReason="Only admins can ban a customer."
              />
            ) : (
              <AuditedAction
                endpoint={`/api/admin/customers/${customer.id}/unban`}
                args={{ p_customer_id: customer.id }}
                actionLabel="Lift ban"
                confirmLabel="Unban customer"
                tone="primary"
                reasonPlaceholder="e.g. Ban was issued in error, ID verified by phone"
                help="Restores the ability to order. Recorded as customer.unban."
                disabled={!canAct}
                disabledReason="Only admins can lift a ban."
              />
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <header>
          <h2>Recent orders</h2>
        </header>

        {detail.recentOrders.length === 0 ? (
          <div className="empty-note">
            <b>No orders yet</b>
            This customer has never ordered.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Amount</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {detail.recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/admin/orders/${order.id}`} className="cell-link">
                        #{order.id}
                      </Link>
                    </td>
                    <td>{order.vendors?.name ?? '—'}</td>
                    <td>
                      <StatusPill status={order.status} />
                    </td>
                    <td>
                      <StatusPill status={order.payment_status} />
                    </td>
                    <td className="num">{formatNaira(Number(order.total_amount))}</td>
                    <td className="muted">{formatDate(order.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
