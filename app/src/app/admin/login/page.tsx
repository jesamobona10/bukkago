import AdminLoginForm from '@/components/admin/AdminLoginForm';

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

  return (
    <div className="login-page">
      <AdminLoginForm next={next} notAnAdmin={notAnAdmin} />
    </div>
  );
}
