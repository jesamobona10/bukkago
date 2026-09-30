import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';

import { VendorStatusPill } from '@/components/admin/StatusPill';
import { loadReport, type Range } from '@/lib/admin/reports';
import { formatCompactNaira, formatNaira } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reports · BukkaGo Admin' };

const RANGES: Range[] = [7, 30, 90];

function parseRange(raw: string | string[] | undefined): Range {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  return (RANGES as number[]).includes(parsed) ? (parsed as Range) : 30;
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const range = parseRange(searchParams.range);
  const report = await loadReport(range);

  const peak = Math.max(1, ...report.daily.map((point) => point.orders));
  const maxDispute = Math.max(1, ...report.disputeBreakdown.map((row) => row.count));

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Platform performance
          </div>
          <h1>Reports</h1>
          <p>
            Orders, revenue and quality signals for the last {range} days. Read-only, and
            computed from the order and dispute tables directly.
          </p>
        </div>
        <div className="admin-head-actions">
          <nav className="range-tabs">
            {RANGES.map((option) => (
              <Link
                key={option}
                href={`/admin/reports?range=${option}`}
                className={option === range ? 'current' : ''}
              >
                {option}d
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {report.orders === 0 ? (
        <div className="admin-empty">
          <span>📈</span>
          <b>No orders in this window</b>
          <p>
            Reports need at least one order to be meaningful. Try a wider range once the
            pilot has been running for a few days.
          </p>
        </div>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi">
              <small>ORDERS</small>
              <b>{report.orders}</b>
              <em>{formatNaira(report.averageOrder)} average</em>
            </div>
            <div className="kpi">
              <small>REVENUE</small>
              <b>{formatCompactNaira(report.revenue)}</b>
              <em>Paid orders only</em>
            </div>
            <div className={`kpi ${report.noShowRate > 0.2 ? 'alert' : ''}`}>
              <small>NO-SHOW RATE</small>
              <b>{Math.round(report.noShowRate * 100)}%</b>
              <em>
                {report.noShows} of {report.resolvedPickups} resolved pickups
              </em>
            </div>
            <div className="kpi warn">
              <small>CANCELLATION</small>
              <b>{Math.round(report.cancellationRate * 100)}%</b>
              <em>Rejected, cancelled and no-show</em>
            </div>
          </div>

          <div className="split-grid">
            <section className="panel">
              <header>
                <h2>Orders and revenue per day</h2>
              </header>
              <div className="chart-body">
                <div className="bar-chart" role="img" aria-label="Orders per day">
                  {report.daily.map((point) => (
                    <div key={point.day} className="bar-col">
                      <div
                        className="bar"
                        style={{ height: `${Math.max(2, (point.orders / peak) * 100)}%` }}
                        title={`${point.day}: ${point.orders} orders, ${formatNaira(point.revenue)}`}
                      />
                      <small>
                        {point.orders > 0 ? point.day.slice(8) : ''}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="chart-foot">
                  Peak {peak} order{peak === 1 ? '' : 's'} in a day. Bars show order count;
                  hover for revenue.
                </p>
              </div>
            </section>

            <section className="panel">
              <header>
                <h2>Dispute mix</h2>
              </header>
              <div className="panel-body">
                <p className="kpi-inline">
                  <b>{report.disputes}</b> disputes ·{' '}
                  {report.orders === 0
                    ? '0'
                    : report.disputesPerOrder.toFixed(2)}{' '}
                  per order
                </p>
                {report.disputeBreakdown.length === 0 ? (
                  <p className="muted">No disputes raised in this window.</p>
                ) : (
                  report.disputeBreakdown.map((row) => (
                    <div key={row.type} className="bar-row">
                      <span>{row.type.replace(/_/g, ' ')}</span>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${(row.count / maxDispute) * 100}%` }}
                        />
                      </div>
                      <b>{row.count}</b>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="split-grid">
            <section className="panel">
              <header>
                <h2>Busiest vendors</h2>
              </header>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>Orders</th>
                      <th>Revenue</th>
                      <th>No-show</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topVendors.map((row) => (
                      <tr key={row.vendor.id}>
                        <td>
                          <Link
                            href={`/admin/vendors/${row.vendor.id}`}
                            className="cell-link"
                          >
                            {row.vendor.name}
                          </Link>
                        </td>
                        <td className="num">{row.orders}</td>
                        <td className="num">{formatNaira(row.revenue)}</td>
                        <td className="num">{Math.round(row.noShowRate * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <header>
                <h2>Needs attention</h2>
              </header>
              <div className="table-scroll">
                {report.worstVendors.length === 0 ? (
                  <div className="empty-note">
                    <b>Nothing to flag</b>
                    No vendor has a no-show problem in this window.
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Vendor</th>
                        <th>Status</th>
                        <th>No-show</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.worstVendors.map((row) => (
                        <tr key={row.vendor.id}>
                          <td>
                            <Link
                              href={`/admin/vendors/${row.vendor.id}`}
                              className="cell-link"
                            >
                              {row.vendor.name}
                            </Link>
                          </td>
                          <td>
                            <VendorStatusPill status={row.vendor.status} />
                          </td>
                          <td className="num">
                            {Math.round(row.noShowRate * 100)}% of {row.orders}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>

          <section className="panel">
            <header>
              <h2>Platform totals</h2>
            </header>
            <dl className="detail-list wide">
              <div>
                <dt>Customers</dt>
                <dd>
                  {report.customers} total · {report.newCustomers} new in {range}d
                </dd>
              </div>
              <div>
                <dt>Vendors</dt>
                <dd>
                  {report.activeVendors} active · {report.newVendors} new in {range}d
                </dd>
              </div>
              <div>
                <dt>Awaiting review</dt>
                <dd>
                  {report.pendingApplications} pending application
                  {report.pendingApplications === 1 ? '' : 's'}
                </dd>
              </div>
              <div>
                <dt>Window</dt>
                <dd>
                  {new Date(report.since).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  onwards
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </>
  );
}
