import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { requireSupabaseEnv } from './env';

export function isServerAction(): boolean {
  try {
    // Reading headers() throws outside a request scope (e.g. during `next build`).
    cookies();
    return true;
  } catch {
    return false;
  }
}

export function createSupabaseServerClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. Session refresh is
          // the middleware's job; swallowing this is the documented @supabase/ssr pattern.
        }
      },
    },
  });
}

export type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;
