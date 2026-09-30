import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import AuditedAction from '@/components/admin/AuditedAction';
import { loadSettings } from '@/lib/admin/queries';
import { formatDateTime } from '@/lib/dates';
import { getAdminUser } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings · BukkaGo Admin' };

export default async function AdminSettingsPage() {
  const admin = await getAdminUser();
  if (admin?.role !== 'super_admin') redirect('/admin');

  const settings = await loadSettings();

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Platform configuration
          </div>
          <h1>Settings</h1>
          <p>
            Values are edited as JSON and validated by the database. Every change records the
            previous value, so you can see what a setting used to be.
          </p>
        </div>
        <div className="admin-head-actions">
          <span className="review-count">{settings.length} SETTINGS</span>
        </div>
      </div>

      <div className="banner banner-info">
        <b>Nothing here is read by the app yet</b>
        <p>
          These rows exist in the schema and the audit trail, but the customer and vendor
          apps do not consume them in this build. Editing a value is safe; it just has no
          effect on behaviour yet.
        </p>
      </div>

      <section className="panel">
        <header>
          <h2>All settings</h2>
        </header>

        {settings.length === 0 ? (
          <div className="empty-note">
            <b>No settings found</b>
            The platform_settings table is empty, so the seed data was not applied.
          </div>
        ) : (
          <div className="settings-list">
            {settings.map((setting) => (
              <div key={setting.key} className="setting-row">
                <div className="setting-head">
                  <div>
                    <b className="mono">{setting.key}</b>
                    <small>
                      Last changed {formatDateTime(setting.updated_at)}
                      {setting.editor ? ` by ${setting.editor.email}` : ''}
                    </small>
                  </div>
                  <AuditedAction
                    endpoint={`/api/admin/settings/${setting.key}`}
                    actionLabel="Edit"
                    confirmLabel="Save setting"
                    tone="primary"
                    fields={[
                      {
                        kind: 'json',
                        name: 'value',
                        label: `New value for ${setting.key}`,
                        required: true,
                        defaultValue: JSON.stringify(setting.value, null, 2),
                      },
                    ]}
                    multilineReason
                    reasonPlaceholder="e.g. Raising the pilot commission for the holiday period"
                    help="Recorded as settings.update with the old and new value."
                  />
                </div>
                <pre className="code-block">{JSON.stringify(setting.value, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
