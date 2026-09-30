import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import AdminNav from '@/components/admin/AdminNav';
import { getAdminUser } from '@/lib/security';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) redirect('/admin/login');

  let admin = null;
  try {
    admin = await getAdminUser();
  } catch (error) {
    console.error('[admin] could not resolve the admin session', error);
  }

  // The middleware normally catches this first; this is the backstop for the case where a
  // session exists but the account has no admin_users row.
  if (!admin) redirect('/admin/login?error=not_an_admin');

  return (
    <div className="admin-layout">
      <AdminNav role={admin.role} email={admin.email} />
      <main className="admin-main">{children}</main>
    </div>
  );
}
