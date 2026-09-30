import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';

import AuditedAction from '@/components/admin/AuditedAction';
import { DisputeStatusPill, StatusPill } from '@/components/admin/StatusPill';
import { loadOrderDetail } from '@/lib/admin/queries';
import { formatDateTime, formatNaira, initials } from '@/lib/dates';
import { getAdminUser } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Order · BukkaGo Admin' };

type Params = { params: { id: string } };

/** Statuses an admin can still intervene in. Everything else is terminal. */
const CLOSED_STATUSES = new Set(['collected', 'cancelled', 'rejected', 'no_show']);

export default async function OrderDetailPage({ params }: Params) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [detail, admin] = await Promise.all([loadOrderDetail(id), getAdminUser()]);

  if (!detail) notFound();

  const { order, items, payments, disputes, customer } = detail;
  const canAct = admin?.role === 'super_admin' || admin?.role === 'support_admin';
  const closed = CLOSED_STATUSES.has(order.status);
  const openDisputes = disputes.filter(
    (dispute) => dispute.status === 'open' || dispute.status === 'investigating'
  );

  return (
    <>
      <Link href="/admin/orders" className="back-link">
        <ChevronLeft size={12} />
        All orders
      </Link>

      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Order #{order.id}
          </div>
          <h1>{order.vendors?.name ?? 'Unknown vendor'}</h1>
          <p>
            Placed {formatDateTime(order.created_at)} · pickup code{' '}
            <b className="mono">{order.pickup_code}</b>
          </p>
        </div>
        <div className="admin-head-actions">
          <StatusPill status={order.status} />
          <StatusPill status={order.payment_status} />
        </div>
      </div>

      {closed ? (
        <div className="banner banner-info">
          <b>This order is closed</b>
          <p>
            Status is {order.status.replace(/_/g, ' ')}, so there is nothing left to
            intervene in. The record stays here for reference.
          </p>
        </div>
      ) : null}

      {openDisputes.length > 0 ? (
        <div className="banner banner-warn">
          <b>
            {openDisputes.length} open dispute{openDisputes.length === 1 ? '' : 's'} on this
            order
          </b>
          <p>
            Resolve the dispute before cancelling, so the reason recorded matches what was
            agreed.{' '}
            <Link href={`/admin/disputes/${openDisputes[0].id}`} className="text-link">
              Open the dispute
            </Link>
          </p>
        </div>
      ) : null}

      <div className="split-grid">
        <section className="panel">
          <header>
            <h2>Items</h2>
          </header>

          {items.length === 0 ? (
            <div className="empty-note">
              <b>No items recorded</b>
              This should not happen on a real order.
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name_snapshot}</td>
                      <td className="num">{item.quantity}</td>
                      <td className="num">{formatNaira(Number(item.price_snapshot))}</td>
                      <td className="num">{formatNaira(Number(item.subtotal))}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={3}>Total</td>
                    <td className="num">{formatNaira(Number(order.total_amount))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <header>
            <h2>Customer</h2>
          </header>
          {customer ? (
            <div className="panel-body">
              <div className="cell-identity">
                <span className="mini-avatar">{initials(customer.name ?? customer.id)}</span>
                <div>
                  <Link href={`/admin/customers/${customer.id}`} className="cell-link">
                    {customer.name ?? 'Unnamed customer'}
                  </Link>
                  <small>{customer.phone ?? 'No phone on file'}</small>
                </div>
              </div>
              {customer.banned_at ? (
                <p className="muted">This customer is currently banned.</p>
              ) : null}
            </div>
          ) : (
            <div className="empty-note">
              <b>Customer record missing</b>
              The account behind this order no longer exists.
            </div>
          )}
        </section>
      </div>

      <div className="split-grid">
        <section className="panel">
          <header>
            <h2>Timeline</h2>
          </header>
          <dl className="detail-list">
            <div>
              <dt>Placed</dt>
              <dd>{formatDateTime(order.created_at)}</dd>
            </div>
            <div>
              <dt>Accepted</dt>
              <dd>{formatDateTime(order.accepted_at)}</dd>
            </div>
            <div>
              <dt>Ready</dt>
              <dd>{formatDateTime(order.ready_at)}</dd>
            </div>
            <div>
              <dt>Collected</dt>
              <dd>{formatDateTime(order.collected_at)}</dd>
            </div>
            <div>
              <dt>Cancelled</dt>
              <dd>{formatDateTime(order.cancelled_at)}</dd>
            </div>
            {order.rejection_reason ? (
              <div>
                <dt>Rejection reason</dt>
                <dd>{order.rejection_reason}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="panel">
          <header>
            <h2>Payments</h2>
          </header>
          {payments.length === 0 ? (
            <div className="empty-note">
              <b>No payment rows</b>
              Payment capture is not wired up in this build.
            </div>
          ) : (
            <div className="panel-body">
              {payments.map((payment) => (
                <dl key={payment.id} className="detail-list">
                  <div>
                    <dt>Provider</dt>
                    <dd>{payment.provider}</dd>
                  </div>
                  <div>
                    <dt>Reference</dt>
                    <dd className="mono">{payment.provider_reference}</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>{formatNaira(Number(payment.amount))}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{payment.status}</dd>
                  </div>
                </dl>
              ))}
            </div>
          )}
        </section>
      </div>

      {disputes.length > 0 ? (
        <section className="panel">
          <header>
            <h2>Disputes</h2>
          </header>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dispute</th>
                  <th>Type</th>
                  <th>Raised by</th>
                  <th>Status</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((dispute) => (
                  <tr key={dispute.id}>
                    <td>
                      <Link href={`/admin/disputes/${dispute.id}`} className="cell-link">
                        #{dispute.id}
                      </Link>
                    </td>
                    <td>{dispute.dispute_type.replace(/_/g, ' ')}</td>
                    <td>{dispute.raised_by_type}</td>
                    <td>
                      <DisputeStatusPill status={dispute.status} />
                    </td>
                    <td className="muted">{formatDateTime(dispute.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!closed ? (
        <section className="panel">
          <header>
            <h2>Admin actions</h2>
          </header>
          <div className="panel-body">
            <AuditedAction
              endpoint={`/api/admin/orders/${order.id}/force-cancel`}
              args={{ p_order_id: order.id }}
              actionLabel="Force cancel order"
              confirmLabel="Force cancel"
              tone="danger"
              multilineReason
              reasonPlaceholder="e.g. Vendor confirmed they cannot fulfil; customer contacted by phone"
              help="Cancels the order, returns the items to vendor stock and frees the pickup slot. The customer is not refunded here — payments are out of scope for this build. Recorded as order.force_cancel."
              disabled={!canAct}
              disabledReason="Only admins can cancel an order."
            />
          </div>
        </section>
      ) : null}
    </>
  );
}
