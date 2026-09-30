import { NextResponse, type NextRequest } from 'next/server';

import { isSupabaseConfigured } from '@/lib/supabase/env';

/**
 * Only the admin panel is guarded for now. The customer and vendor screens are still
 * sample-data prototypes with no session, and running them through Supabase SSR would
 * fail every request on a project that has no env vars configured yet.
 */
export const config = {
  matcher: ['/admin', '/admin/((?!login).*)', '/api/admin/:path*'],
};

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next();

  // Imported lazily so a project without env vars can still serve every other route.
  const { createMiddlewareClient } = await import('@/lib/supabase/middleware');
  return createMiddlewareClient(request);
}
