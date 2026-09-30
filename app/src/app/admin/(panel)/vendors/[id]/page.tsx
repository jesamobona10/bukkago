import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';

import AuditedAction from '@/components/admin/AuditedAction';
import { VendorStatusPill } from '@/components/admin/StatusPill';
import { loadVendorDetail } from '@/lib/admin/queries';
import { formatDate, formatNaira, formatRelativeTime } from '@/lib/dates';
import { getAdminUser } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vendor · BukkaGo Admin' };

type Params = { params: { id: string } };

export default async function VendorDetailPage({ params }: Params) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [detail, admin] = await Promise.all([loadVendorDetail(id), getAdminUser()]);

  if (!detail) notFound();

  const { vendor, inFlight, suspensionAdmin } = detail;
  const canAct = admin?.role === 'super_admin' || admin?.role === 'support_admin';
  const suspendable = vendor.status === 'pending' || vendor.status === 'active';

  return (
    <>
      <Link href="/admin/vendors" className="back-link">
        <ChevronLeft size={12} />
        All vendors
      </Link>

      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Vendor
          </div>
          <h1>{vendor.name}</h1>
          <p>
            {[vendor.area, vendor.phone].filter(Boolean).join(' · ') ||
              'No area or phone on file'}
            {' · joined '}
            {formatDate(vendor.created_at)}
          </p>
        </div>
        <div className="admin-head-actions">
          <VendorStatusPill status={vendor.status} />
        </div>
      </div>

      {vendor.status === 'suspended' ? (
        <div className="banner banner-warn">
          <b>Suspended {formatRelativeTime(vendor.suspended_at ?? vendor.created_at)}</b>
          <p>
            {vendor.suspended_reason}
            {suspensionAdmin ? ` — ${suspensionAdmin.email}` : ''}
          </p>
        </div>
      ) : null}

      {inFlight > 0 && vendor.status === 'suspended' ? (
        <div className="banner banner-info">
          <b>
            {inFlight} order{inFlight === 1 ? '' : 's'} still running
          </b>
          <p>
            Suspension blocks new orders but lets accepted orders finish. This vendor can
            still mark these ready for collection.
          </p>
        </div>
      ) : null}

      <div className="kpi-row">
        <div className="kpi">
          <small>ORDERS</small>
          <b>{detail.orderCount}</b>
          <em>All time, last 200 counted</em>
        </div>
        <div className="kpi">
          <small>PAID REVENUE</small>
          <b>{formatNaira(detail.revenue)}</b>
          <em>Paid orders only</em>
        </div>
        <div className="kpi">
          <small>MENU ITEMS</small>
          <b>{detail.menuCount}</b>
          <em>Live and sold out</em>
        </div>
        <div className="kpi warn">
          <small>NO-SHOWS</small>
          <b>{detail.noShows}</b>
          <em>Orders marked no_show</em>
        </div>
      </div>

      <div className="split-grid">
        <section className="panel">
          <header>
            <h2>Details</h2>
          </header>
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>
                <VendorStatusPill status={vendor.status} />
              </dd>
            </div>
            <div>
              <dt>Area</dt>
              <dd>{vendor.area ?? '—'}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{vendor.address ?? '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{vendor.phone ?? '—'}</dd>
            </div>
            <div>
              <dt>Avg prep time</dt>
              <dd>{vendor.avg_prep_time_minutes} min</dd>
            </div>
            <div>
              <dt>Open pickup slots</dt>
              <dd>{detail.openSlots}</dd>
            </div>
            <div>
              <dt>Commission rate</dt>
              <dd>
                {vendor.commission_rate === null
                  ? 'Platform default'
                  : `${Number(vendor.commission_rate) * 100}%`}
              </dd>
            </div>
            <div>
              <dt>Applied</dt>
              <dd>{formatDate(vendor.created_at)}</dd>
            </div>
          </dl>

          {vendor.description ? (
            <div className="detail-note">
              <b>Description</b>
              <p>{vendor.description}</p>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <header>
            <h2>Actions</h2>
          </header>
          <div className="panel-body">
            {vendor.status === 'pending' ? (
              <>
                <p className="muted">
                  This application is waiting for review. Approve or reject it from the
                  vendors list.
                </p>
                <Link href="/admin/vendors?status=pending" className="approve-app as-button">
                  Go to pending applications
                </Link>
              </>
            ) : null}

            {suspendable ? (
              <AuditedAction
                endpoint={`/api/admin/vendors/${vendor.id}/suspend`}
                args={{ p_vendor_id: vendor.id }}
                actionLabel="Suspend vendor"
                confirmLabel="Suspend vendor"
                tone="danger"
                reasonPlaceholder="e.g. Repeated customer complaints about undelivered orders"
                help="Stops new orders immediately. Orders already accepted keep running, and the vendor can still finish them. Recorded as vendor.suspend."
                disabled={!canAct}
                disabledReason="Only admins can suspend a vendor."
              />
            ) : null}

            {vendor.status === 'suspended' ? (
              <AuditedAction
                endpoint={`/api/admin/vendors/${vendor.id}/reactivate`}
                args={{ p_vendor_id: vendor.id }}
                actionLabel="Reactivate vendor"
                confirmLabel="Reactivate"
                tone="primary"
                reasonPlaceholder="e.g. Issue resolved, stall inspected on 12 March"
                help="Returns the vendor to active. Recorded as vendor.reactivate."
                disabled={!canAct}
                disabledReason="Only admins can reactivate a vendor."
              />
            ) : null}

            {vendor.status === 'rejected' ? (
              <p className="muted">
                This application was rejected. Rejected vendors cannot be reinstated from
                the panel.
              </p>
            ) : null}
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
            This vendor has not taken an order.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Items</th>
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
                    <td>
                      <span className={`status-pill s-${order.status}`}>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill s-${order.payment_status}`}>
                        {order.payment_status}
                      </span>
                    </td>
                    <td>{order.order_items?.[0]?.quantity ?? '—'}</td>
                    <td className="num">{formatNaira(Number(order.total_amount))}</td>
                    <td className="muted">{formatRelativeTime(order.created_at)}</td>
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
