import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';

import AuditedAction from '@/components/admin/AuditedAction';
import { DisputeStatusPill, StatusPill } from '@/components/admin/StatusPill';
import { loadDisputeDetail } from '@/lib/admin/queries';
import { formatDateTime, formatNaira } from '@/lib/dates';
import { getAdminUser } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dispute · BukkaGo Admin' };

type Params = { params: { id: string } };

const STATUS_OPTIONS = [
  { value: 'investigating', label: 'Investigating — pick it up' },
  { value: 'resolved', label: 'Resolved — settled' },
  { value: 'rejected', label: 'Rejected — not upheld' },
];

export default async function DisputeDetailPage({ params }: Params) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [detail, admin] = await Promise.all([loadDisputeDetail(id), getAdminUser()]);

  if (!detail) notFound();

  const { dispute, order, resolver } = detail;
  const canAct = admin?.role === 'super_admin' || admin?.role === 'support_admin';
  const closed = dispute.status === 'resolved' || dispute.status === 'rejected';

  return (
    <>
      <Link href="/admin/disputes" className="back-link">
        <ChevronLeft size={12} />
        All disputes
      </Link>

      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Dispute #{dispute.id}
          </div>
          <h1>{dispute.dispute_type.replace(/_/g, ' ')}</h1>
          <p>
            Raised by {dispute.raised_by_type} on{' '}
            {formatDateTime(dispute.created_at)}
          </p>
        </div>
        <div className="admin-head-actions">
          <DisputeStatusPill status={dispute.status} />
        </div>
      </div>

      {closed ? (
        <div className="banner banner-info">
          <b>Closed</b>
          <p>
            {dispute.resolution_notes}
            {resolver ? ` — decided by ${resolver.email}` : ''}
            {dispute.resolved_at ? ` on ${formatDateTime(dispute.resolved_at)}` : ''}
          </p>
        </div>
      ) : null}

      <div className="split-grid">
        <section className="panel">
          <header>
            <h2>Report</h2>
          </header>
          <div className="panel-body">
            <p className="quote">{dispute.description}</p>
            <dl className="detail-list">
              <div>
                <dt>Type</dt>
                <dd>{dispute.dispute_type.replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt>Raised by</dt>
                <dd>
                  {dispute.raised_by_type}
                  {detail.raiser ? ` (${detail.raiser.email})` : ''}
                </dd>
              </div>
              <div>
                <dt>Opened</dt>
                <dd>{formatDateTime(dispute.created_at)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="panel">
          <header>
            <h2>Order</h2>
          </header>
          {order ? (
            <div className="panel-body">
              <dl className="detail-list">
                <div>
                  <dt>Order</dt>
                  <dd>
                    <Link href={`/admin/orders/${order.id}`} className="cell-link">
                      #{order.id}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Vendor</dt>
                  <dd>
                    <Link href={`/admin/vendors/${order.vendor_id}`} className="cell-link">
                      {order.vendors?.name ?? '—'}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>{formatNaira(Number(order.total_amount))}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <StatusPill status={order.status} />
                  </dd>
                </div>
                <div>
                  <dt>Payment</dt>
                  <dd>
                    <StatusPill status={order.payment_status} />
                  </dd>
                </div>
                <div>
                  <dt>Placed</dt>
                  <dd>{formatDateTime(order.created_at)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="empty-note">
              <b>Order not found</b>
              The order this dispute refers to is missing.
            </div>
          )}
        </section>
      </div>

      {!closed ? (
        <section className="panel">
          <header>
            <h2>Resolve</h2>
          </header>
          <div className="panel-body">
            <AuditedAction
              endpoint={`/api/admin/disputes/${dispute.id}/resolve`}
              args={{ p_dispute_id: dispute.id }}
              actionLabel="Update this dispute"
              confirmLabel="Save decision"
              tone="primary"
              fields={[
                {
                  kind: 'select',
                  name: 'status',
                  label: 'New status',
                  required: true,
                  defaultValue: dispute.status === 'open' ? 'investigating' : dispute.status,
                  options: STATUS_OPTIONS,
                },
                {
                  kind: 'textarea',
                  name: 'resolution_notes',
                  label: 'What was decided',
                  required: true,
                  defaultValue: dispute.resolution_notes ?? '',
                  placeholder:
                    'e.g. Spoke to both parties. Vendor refunded the portion for the missing item.',
                },
              ]}
              requiresReason={false}
              help="Closing a dispute requires written notes — the database refuses otherwise. Recorded as dispute.resolve."
              disabled={!canAct}
              disabledReason="Only admins can resolve a dispute."
            />
          </div>
        </section>
      ) : null}
    </>
  );
}
