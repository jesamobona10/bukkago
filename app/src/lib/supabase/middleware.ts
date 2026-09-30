import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { requireSupabaseEnv } from './env';

const LOGIN_PATH = '/admin/login';

/**
 * @supabase/ssr requires a middleware that refreshes the auth cookie on every request,
 * otherwise server components eventually read an expired session. While we are here we
 * also bounce anyone who is not a BukkaGo admin away from the panel.
 */
export async function createMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const { url, anonKey } = requireSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request: { headers: request.headers } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  // API routes answer with a 401/403 rather than a redirect — a redirect to an HTML login
  // page is not a useful response to a fetch() from the panel.
  if (pathname.startsWith('/api/admin')) {
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.', code: 'unauthenticated' }, { status: 401 });
    }
    const { data: admin } = await supabase
      .from('admin_users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!admin) {
      return NextResponse.json(
        { error: 'This account is not a BukkaGo admin.', code: 'not_an_admin' },
        { status: 403 }
      );
    }
    return response;
  }

  if (pathname === LOGIN_PATH) {
    // Already an admin and trying to reach the login page — send them to the dashboard.
    if (user) {
      const { data: admin } = await supabase
        .from('admin_users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (admin) return NextResponse.redirect(new URL('/admin', request.url));
    }
    return response;
  }

  if (!user) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!admin) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set('error', 'not_an_admin');
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
