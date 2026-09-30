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

// These must be read as literal `process.env.NEXT_PUBLIC_*` member expressions.
//
// Next.js inlines NEXT_PUBLIC_* into the browser bundle by textual substitution of literal
// member accesses (webpack DefinePlugin). A computed lookup such as `process.env[key]` is
// invisible to that substitution, so in the browser `process.env` is an empty object shim
// and the lookup silently yields undefined — while the same code on the server reads the
// real value out of Node's process.env. That asymmetry is invisible in review and in
// typecheck, and it only shows up as "Supabase is not configured" at runtime in the
// browser, on a page the server happily rendered as configured.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function requireSupabaseEnv(): { url: string; anonKey: string } {
  const missing: string[] = [];
  if (!URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (missing.length > 0) throw new SupabaseEnvError(missing);

  return { url: URL as string, anonKey: ANON_KEY as string };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(URL && ANON_KEY);
}
