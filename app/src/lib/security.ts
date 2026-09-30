import type { AdminRole, AdminUser } from './database.types';
import { createSupabaseServerClient, type SupabaseServerClient } from './supabase/server';

export class AdminAuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AdminAuthError';
    this.code = code;
    this.status = status;
  }
}

export type AuthContext = {
  userId: string;
  email: string | null;
};

/**
 * Resolves the signed-in user from the request cookie, not from a JWT we decoded
 * ourselves. getUser() revalidates against Supabase Auth, so a stale or forged cookie
 * cannot pass as an admin.
 */
export async function getAuthContext(
  client: SupabaseServerClient = createSupabaseServerClient()
): Promise<AuthContext | null> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) return null;

  return { userId: user.id, email: user.email ?? null };
}

/**
 * Reads the caller's own admin_users row. RLS on admin_users only permits
 * `id = auth.uid()`, so this can only ever return the caller's own record — there is no
 * id parameter to point it at somebody else.
 */
export async function getAdminUser(
  client: SupabaseServerClient = createSupabaseServerClient()
): Promise<AdminUser | null> {
  const auth = await getAuthContext(client);
  if (!auth) return null;

  const { data, error } = await client
    .from('admin_users')
    .select('id, email, role, created_at')
    .eq('id', auth.userId)
    .maybeSingle();

  if (error || !data) return null;

  return data as AdminUser;
}

export async function requireAdminUser(
  client?: SupabaseServerClient
): Promise<AdminUser> {
  const supabase = client ?? createSupabaseServerClient();
  const auth = await getAuthContext(supabase);
  if (!auth) {
    throw new AdminAuthError('unauthenticated', 'You must be signed in.', 401);
  }

  const admin = await getAdminUser(supabase);
  if (!admin) {
    throw new AdminAuthError(
      'not_an_admin',
      'This account is not a BukkaGo admin.',
      403
    );
  }

  return admin;
}

export async function requireSuperAdminUser(
  client?: SupabaseServerClient
): Promise<AdminUser> {
  const admin = await requireAdminUser(client);
  if (admin.role !== 'super_admin') {
    throw new AdminAuthError(
      'forbidden',
      'Only a Super Admin can perform this action.',
      403
    );
  }
  return admin;
}

export function requireReason(reason: unknown): string {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new AdminAuthError(
      'reason_required',
      'A reason is required and is recorded in the audit log.',
      400
    );
  }
  if (reason.length > 2000) {
    throw new AdminAuthError(
      'reason_too_long',
      'Reason must be 2000 characters or fewer.',
      400
    );
  }
  return reason.trim();
}

export function hasRole(admin: AdminUser, ...roles: AdminRole[]): boolean {
  return roles.includes(admin.role);
}
