export class SupabaseEnvError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `Supabase is not configured. Missing environment ${
        missing.length === 1 ? 'variable' : 'variables'
      }: ${missing.join(', ')}. Copy app/.env.example to app/.env.local and fill it in.`
    );
    this.name = 'SupabaseEnvError';
    this.missing = missing;
  }
}

const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;

export function requireSupabaseEnv(): { url: string; anonKey: string } {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) throw new SupabaseEnvError([...missing]);

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  };
}

export function isSupabaseConfigured(): boolean {
  return REQUIRED.every((key) => Boolean(process.env[key]));
}
