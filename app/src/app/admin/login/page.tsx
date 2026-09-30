import AdminLoginForm from '@/components/admin/AdminLoginForm';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

type SearchParams = { error?: string; next?: string };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // A `next` that points outside /admin would be an open redirect, so it is filtered
  // again on the client before it is ever used to navigate.
  const raw = typeof searchParams.next === 'string' ? searchParams.next : '/admin';
  const next = raw.startsWith('/admin') && !raw.startsWith('//') ? raw : '/admin';
  const notAnAdmin = searchParams.error === 'not_an_admin';

  // Resolved here and passed down, rather than read inside the client form. NEXT_PUBLIC_*
  // values are statically inlined into the browser bundle at build time but read live on
  // the server, so a client component that inspects them renders a different tree than the
  // server HTML whenever the two disagree — which they did the moment .env.local changed
  // without a full client rebuild. The server decides; the client renders what it is told.
  const configured = isSupabaseConfigured();

  return (
    <div className="login-page">
      <AdminLoginForm next={next} notAnAdmin={notAnAdmin} configured={configured} />
    </div>
  );
}
