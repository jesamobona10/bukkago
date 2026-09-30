import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import VendorApplicationList from '@/components/admin/VendorApplicationList';
import type { Vendor } from '@/lib/database.types';
import { getAdminUser } from '@/lib/security';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const VENDOR_FIELDS = 'id, name, area, address, phone, description, created_at';

export default async function AdminVendorsPage() {
  const supabase = createSupabaseServerClient();
  const admin = await getAdminUser();

  // RLS: vendors_public_read already lets an admin see every row, not just active ones.
  const { data, error } = await supabase
    .from('vendors')
    .select(VENDOR_FIELDS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[admin] could not load vendor applications', error);
  }

  const vendors = (data ?? []) as Vendor[];

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">
            <i className="eyebrow-dot" />
            Vendor management
          </div>
          <h1>Pending applications</h1>
          <p>
            A vendor stays invisible to customers until approved here. Every decision is
            recorded in the audit log with a reason.
          </p>
        </div>
        <div className="admin-head-actions">
          <span className="review-count">
            {vendors.length} AWAITING REVIEW
          </span>
        </div>
      </div>

      <div className="admin-review">
        <div className="admin-review-head">
          <div>
            <h2>Applications</h2>
            <p>Oldest first — these have been waiting longest.</p>
          </div>
        </div>
        <VendorApplicationList
          vendors={vendors}
          canAct={admin?.role === 'super_admin' || admin?.role === 'support_admin'}
        />
      </div>

      <div className="admin-live">
        <span className="live-icon">
          <ExternalLink size={13} />
        </span>
        <div>
          <b>Vendor detail, suspension and menu inspection arrive in Phase 2</b>
          <small>
            The full vendor list with filters, per-vendor order history and the suspend /
            reactivate actions are still to build.{' '}
            <Link href="/admin" className="text-link" style={{ padding: 0 }}>
              Back to overview
            </Link>
          </small>
        </div>
      </div>
    </>
  );
}
