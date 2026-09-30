import type { Metadata } from 'next';
import Link from 'next/link';
import { Store } from 'lucide-react';

import AuditedAction from '@/components/admin/AuditedAction';
import FilterBar from '@/components/admin/FilterBar';
import Pagination from '@/components/admin/Pagination';
import { VendorStatusPill } from '@/components/admin/StatusPill';
import { loadVendors, VENDOR_STATUSES } from '@/lib/admin/queries';
import { formatDate, initials } from '@/lib/dates';
import { getAdminUser } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vendors · BukkaGo Admin' };

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const admin = await getAdminUser();
  const result = await loadVendors(searchParams);
  const canAct = admin?.role === 'super_admin' || admin?.role === 'support_admin';

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Vendor management
          </div>
          <h1>Vendors</h1>
          <p>
            Review applications, and suspend or reinstate a vendor when something goes wrong.
            Every status change is recorded with a reason.
          </p>
        </div>
        <div className="admin-head-actions">
          <span className="review-count">{result.total} VENDORS</span>
        </div>
      </div>

      <section className="panel">
        <header className="panel-head">
          <h2>All vendors</h2>
          <AuditedAction
            endpoint="/api/admin/vendors/provision"
            actionLabel="Add vendor"
            confirmLabel="Create vendor"
            tone="primary"
            fields={[
              { kind: 'text', name: 'name', label: 'Vendor name', required: true },
              { kind: 'text', name: 'area', label: 'Area', placeholder: 'e.g. Lekki Phase 1' },
              { kind: 'text', name: 'phone', label: 'Phone' },
              { kind: 'text', name: 'address', label: 'Address' },
              { kind: 'textarea', name: 'description', label: 'Description' },
            ]}
            reasonPlaceholder="e.g. Added by hand after the application form was abandoned"
            help="Creates a pending application, not a live vendor. Approve it here to make it visible to customers."
            disabled={!canAct}
            disabledReason="Only admins can add a vendor."
          />
        </header>

        <FilterBar
          searchPlaceholder="Search by name, area or address…"
          selects={[
            {
              key: 'status',
              label: 'Status',
              options: [
                { value: 'all', label: 'Any status' },
                ...VENDOR_STATUSES.map((status) => ({
                  value: status,
                  label: status[0].toUpperCase() + status.slice(1),
                })),
              ],
            },
          ]}
        />

        {result.rows.length === 0 ? (
          <div className="empty-note">
            <b>No vendors match</b>
            {result.filters.term || result.filters.status !== 'all'
              ? 'Try clearing the filters.'
              : 'No vendors have applied yet.'}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Area</th>
                  <th>Status</th>
                  <th>Applied</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.rows.map((vendor) => (
                  <tr key={vendor.id}>
                    <td>
                      <div className="cell-identity">
                        <span className="mini-avatar">{initials(vendor.name)}</span>
                        <div>
                          <Link href={`/admin/vendors/${vendor.id}`} className="cell-link">
                            {vendor.name}
                          </Link>
                          {vendor.phone ? <small>{vendor.phone}</small> : null}
                        </div>
                      </div>
                    </td>
                    <td>{vendor.area ?? '—'}</td>
                    <td>
                      <VendorStatusPill status={vendor.status} />
                    </td>
                    <td className="muted">{formatDate(vendor.created_at)}</td>
                    <td className="actions-cell">
                      {/* Pending applications keep the inline approve/reject flow from
                          Phase 1; everything else is managed from the vendor page. */}
                      {vendor.status === 'pending' ? (
                        <div className="row-actions">
                          <AuditedAction
                            endpoint={`/api/admin/vendors/${vendor.id}/approve`}
                            args={{ p_vendor_id: vendor.id }}
                            actionLabel="Approve"
                            confirmLabel="Approve vendor"
                            tone="primary"
                            reasonPlaceholder="e.g. Verified the stall location and food handling certificate"
                            help="Makes the vendor visible to customers. Recorded as vendor.approve."
                            disabled={!canAct}
                          />
                          <AuditedAction
                            endpoint={`/api/admin/vendors/${vendor.id}/reject`}
                            args={{ p_vendor_id: vendor.id }}
                            actionLabel="Reject"
                            confirmLabel="Reject vendor"
                            tone="danger"
                            reasonPlaceholder="e.g. Menu prices unclear, applicant unresponsive"
                            help="Keeps the vendor off the platform. Recorded as vendor.reject."
                            disabled={!canAct}
                          />
                        </div>
                      ) : null}
                      <Link href={`/admin/vendors/${vendor.id}`} className="row-link">
                        <Store size={11} />
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
          label="vendors"
          searchParams={searchParams}
        />
      </section>
    </>
  );
}
