'use client';

import { createBrowserClient } from '@supabase/ssr';

import { requireSupabaseEnv } from './env';

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  if (cached) return cached;

  const { url, anonKey } = requireSupabaseEnv();
  cached = createBrowserClient(url, anonKey);
  return cached;
}
