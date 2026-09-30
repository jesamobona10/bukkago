import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';

import { loadOverview, type ActivityEntry } from '@/lib/admin/overview';
import type { OrderStatus } from '@/lib/database.types';
import {
  formatCompactNaira,
  formatDateRange,
  formatNaira,
  formatRelativeTime,
} from '@/lib/dates';

export const dynamic = 'force-dynamic';

const ORDER_STATUS_ORDER: OrderStatus[] = [
  'pending',
  'preparing',
  'ready',
  'collected',
  'no_show',
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready',
  collected: 'Collected',
  no_show: 'No-show',
  accepted: 'Accepted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const ACTION_LABELS: Record<string, string> = {
  'vendor.approve': 'approved vendor',
  'vendor.reject': 'rejected vendor',
  'vendor.suspend': 'suspended vendor',
  'vendor.reactivate': 'reactivated vendor',
  'order.force_cancel': 'force-cancelled order',
  'customer.ban': 'banned customer',
  'refund.issue': 'issued refund',
  'dispute.resolve': 'resolved dispute',
  'admin.role_change': 'changed an admin role',
  'settings.update': 'changed platform settings',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function initialsFor(email: string | null): string {
  if (!email) return '?';
  const local = email.split('@')[0];
  return (local.slice(0, 2) || '?').toUpperCase();
}

function StatusSplit({
  tally,
  statuses,
}: {
  tally: Partial<Record<string, number>>;
  statuses: OrderStatus[];
}) {
  const present = statuses.filter((status) => (tally[status] ?? 0) > 0);
  if (present.length === 0) return <em>No orders yet</em>;

  return (
    <div className="status-split">
      {present.map((status) => (
        <span key={status} className={`s-${status}`}>
          {STATUS_LABELS[status]} {tally[status]}
        </span>
      ))}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="activity-row">
      <span>{initialsFor(entry.admin?.email ?? null)}</span>
      <div>
        <b>
          {entry.admin?.email ?? 'Unknown admin'}{' '}
          <code>{actionLabel(entry.action)}</code>
        </b>
        <p>
          {entry.target_table} #{entry.target_id}
          {entry.reason ? (
            <>
              {' — '}
              <em>&ldquo;{entry.reason}&rdquo;</em>
            </>
          ) : null}
        </p>
      </div>
      <time dateTime={entry.created_at}>{formatRelativeTime(entry.created_at)}</time>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const overview = await loadOverview();
  const activeVendors = overview.vendorStatusTally.active ?? 0;

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Platform overview
          </div>
          <h1>Is the whole platform healthy?</h1>
          <p>
            Live figures across every vendor, order and payment. Where something needs a
            human decision, it is called out below.
          </p>
        </div>
        <div className="admin-head-actions">
          <span className="admin-mode">
            <ShieldCheck size={12} />
            AUDITED CONSOLE
          </span>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <small>ORDERS TODAY</small>
          <b>{overview.ordersToday}</b>
          <StatusSplit tally={overview.orderStatusTally} statuses={ORDER_STATUS_ORDER} />
        </div>

        <div className="kpi">
          <small>REVENUE TODAY</small>
          <b>{formatCompactNaira(overview.revenueToday)}</b>
          <em>Paid orders only · {formatNaira(overview.revenueToday)}</em>
        </div>

        <div className="kpi">
          <small>REVENUE THIS WEEK</small>
          <b>{formatCompactNaira(overview.revenueThisWeek)}</b>
          <em>
            {formatDateRange(overview.weekStart, overview.todayStart)} ·{' '}
            {formatNaira(overview.revenueThisWeek)}
          </em>
        </div>

        <div className={`kpi${overview.pendingApplications > 0 ? ' warn' : ''}`}>
          <small>VENDORS</small>
          <b>{activeVendors}</b>
          <em>
            Active · {overview.pendingApplications} pending ·{' '}
            {overview.vendorStatusTally.suspended ?? 0} suspended
          </em>
        </div>
      </div>

      <div className="admin-review" style={{ marginBottom: 15 }}>
        <div className="admin-review-head">
          <div>
            <h2>System alerts</h2>
            <p>Things worth a human look before they become a support ticket.</p>
          </div>
          <span className="review-count">
            {overview.openDisputes} OPEN DISPUTE{overview.openDisputes === 1 ? '' : 'S'}
          </span>
        </div>
        <div className="alert-list">
          {overview.alerts.map((alert) => (
            <div
              key={alert.title}
              className={`alert-row${alert.tone === 'ok' ? ' okay' : ''}`}
            >
              <span>
                {alert.tone === 'ok' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              </span>
              <div>
                <b>{alert.title}</b>
                <p>{alert.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-review">
        <div className="admin-review-head">
          <div>
            <h2>Recent admin activity</h2>
            <p>
              Append-only. Rows here cannot be edited or deleted through the application.
            </p>
          </div>
          <span className="review-count">30-DAY NO-SHOW RATE</span>
        </div>
        <div className="activity-list">
          {overview.activity.length === 0 ? (
            <div className="empty-note">
              <b>No audited actions yet</b>
              Approve a vendor application and its audit row will appear here immediately.
            </div>
          ) : (
            overview.activity.map((entry) => <ActivityRow key={entry.id} entry={entry} />)
          )}
        </div>
        <div className="admin-live">
          <span className="live-icon">
            <ShieldCheck size={13} />
          </span>
          <div>
            <b>
              No-show rate:{' '}
              {overview.noShowSample === 0
                ? 'not enough data'
                : `${Math.round(overview.noShowRate * 100)}%`}
            </b>
            <small>
              {overview.noShowSample === 0
                ? 'Needs orders that reach Ready before this is meaningful.'
                : `${overview.noShowSample} orders reached Ready in the last 30 days. This is the PRD's core success metric.`}
            </small>
          </div>
        </div>
      </div>
    </>
  );
}
