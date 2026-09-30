import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import AuditedAction from '@/components/admin/AuditedAction';
import { loadAdmins } from '@/lib/admin/queries';
import { formatDate, initials } from '@/lib/dates';
import { getAdminUser } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin users · BukkaGo Admin' };

export default async function AdminAdminsPage() {
  const admin = await getAdminUser();

  // The panel layout already gates on "is an admin"; this is the tier check for Phase 5.
  if (admin?.role !== 'super_admin') redirect('/admin');

  const admins = await loadAdmins();
  const superAdmins = admins.filter((row) => row.role === 'super_admin').length;

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Access control
          </div>
          <h1>Admin users</h1>
          <p>
            Super Admins manage accounts and platform settings. Support Admins handle
            vendors, customers, orders and disputes. Only a Super Admin can change a role.
          </p>
        </div>
        <div className="admin-head-actions">
          <span className="review-count">{admins.length} ADMINS</span>
        </div>
      </div>

      {superAdmins < 2 ? (
        <div className="banner banner-warn">
          <b>Only {superAdmins} Super Admin</b>
          <p>
            Promoting somebody else is the only way back into this section if you lose your
            own access. The panel refuses to demote the last Super Admin.
          </p>
        </div>
      ) : null}

      <section className="panel">
        <header className="panel-head">
          <h2>Accounts</h2>
          <AuditedAction
            endpoint="/api/admin/admins/provision"
            actionLabel="Add admin"
            confirmLabel="Grant access"
            tone="primary"
            fields={[
              {
                kind: 'text',
                name: 'user_id',
                label: 'Supabase Auth user UUID',
                required: true,
                placeholder: 'e.g. 3f1a…-…-…',
              },
              { kind: 'text', name: 'email', label: 'Email', required: true },
              {
                kind: 'select',
                name: 'role',
                label: 'Role',
                required: true,
                defaultValue: 'support_admin',
                options: [
                  { value: 'support_admin', label: 'Support Admin' },
                  { value: 'super_admin', label: 'Super Admin' },
                ],
              },
            ]}
            multilineReason
            reasonPlaceholder="e.g. Promoted to run the Tuesday market pilot"
            help="The person must already have a Supabase Auth account. This grants panel access and is recorded as admin.provision."
          />
        </header>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Role</th>
                <th>Added</th>
                <th>Change role</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((row) => {
                const isSelf = row.id === admin.id;
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="cell-identity">
                        <span className="mini-avatar">{initials(row.email)}</span>
                        <div>
                          <span className="cell-link">
                            {row.email}
                            {isSelf ? <em className="you-tag">you</em> : null}
                          </span>
                          <small className="mono">{row.id}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          row.role === 'super_admin' ? 's-paid' : 's-collected'
                        }`}
                      >
                        {row.role === 'super_admin' ? 'Super Admin' : 'Support Admin'}
                      </span>
                    </td>
                    <td className="muted">{formatDate(row.created_at)}</td>
                    <td>
                      <AuditedAction
                        endpoint={`/api/admin/admins/${row.id}/role`}
                        args={{ p_user_id: row.id }}
                        actionLabel={row.role === 'super_admin' ? 'Demote' : 'Promote'}
                        confirmLabel="Change role"
                        tone={row.role === 'super_admin' ? 'danger' : 'primary'}
                        fields={[
                          {
                            kind: 'select',
                            name: 'role',
                            label: 'New role',
                            required: true,
                            defaultValue:
                              row.role === 'super_admin' ? 'support_admin' : 'super_admin',
                            options: [
                              { value: 'support_admin', label: 'Support Admin' },
                              { value: 'super_admin', label: 'Super Admin' },
                            ],
                          },
                        ]}
                        reasonPlaceholder="e.g. Moving to Support Admin for the pilot handover"
                        help="Recorded as admin.role_change. The last Super Admin cannot be demoted."
                        disabled={isSelf}
                        disabledReason={
                          isSelf
                            ? 'You cannot change your own role. Ask another Super Admin.'
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
