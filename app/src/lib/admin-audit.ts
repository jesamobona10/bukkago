import type { AdminUser } from './database.types';
import {
  AdminAuthError,
  getAuthContext,
  requireReason,
} from './security';
import { createSupabaseServerClient, type SupabaseServerClient } from './supabase/server';

/**
 * Replaces the `withAdminAudit` helper sketched in
 * DOCS/10-SUPER-ADMIN-IMPLEMENTATION-GUIDE.md §2.
 *
 * The guide's version verifies the caller, performs the write with the service-role
 * client, and then inserts the audit row as a second call — so a failed audit insert
 * leaves a money- or access-affecting change with no record, which spec §6 calls
 * non-negotiable. It also passes the service role through, which makes auth.uid() null
 * server-side and silently breaks the `is_admin()` check.
 *
 * Instead every sensitive action is a SECURITY DEFINER Postgres function that does the
 * write and the admin_audit_log insert in one transaction, and we call it with the
 * acting admin's own session. This wrapper only does the cheap checks that should fail
 * before a round trip; the database remains the enforcement point.
 */

export type AuditedRpc = 'admin_approve_vendor' | 'admin_reject_vendor';

const RPC_ERRORS: Record<string, { status: number; message: string }> = {
  FORBIDDEN: { status: 403, message: 'You are not allowed to perform this action.' },
  REASON_REQUIRED: { status: 400, message: 'A reason is required and is recorded in the audit log.' },
  VENDOR_NOT_FOUND: { status: 404, message: 'Vendor not found.' },
  VENDOR_NOT_PENDING: {
    status: 409,
    message: 'That application has already been decided. Reload and try again.',
  },
};

export class AdminActionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AdminActionError';
    this.code = code;
    this.status = status;
  }
}

function mapRpcError(error: { message: string; code?: string }): AdminActionError {
  const known = RPC_ERRORS[error.message];
  if (known) return new AdminActionError(error.message, known.message, known.status);
  return new AdminActionError(
    'action_failed',
    error.message || 'The action could not be completed.',
    500
  );
}

export type AuditedAction = {
  /** The SECURITY DEFINER function to call. Must be on the AuditedRpc allowlist. */
  rpc: AuditedRpc;
  /** Named arguments for the function, excluding any reason the caller must supply. */
  args: Record<string, unknown>;
  /** True when the action requires a non-blank reason, which lands in the audit log. */
  requiresReason?: boolean;
  reason?: unknown;
  /** Restrict the action to one of the admin tiers before it reaches the database. */
  allowedRoles?: AdminUser['role'][];
  client?: SupabaseServerClient;
};

export type AuditedActionResult<T> = {
  data: T;
  admin: { id: string; email: string | null; role: AdminUser['role'] };
};

export async function runAuditedAction<T>({
  rpc,
  args,
  requiresReason = false,
  reason,
  allowedRoles,
  client,
}: AuditedAction): Promise<AuditedActionResult<T>> {
  const supabase = client ?? createSupabaseServerClient();

  const auth = await getAuthContext(supabase);
  if (!auth) {
    throw new AdminActionError('unauthenticated', 'You must be signed in.', 401);
  }

  // RLS on admin_users only permits `id = auth.uid()`, so this can only ever return the
  // caller's own row — there is no id argument to point it at another admin.
  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, email, role')
    .eq('id', auth.userId)
    .maybeSingle();

  if (!admin) {
    throw new AdminActionError('not_an_admin', 'This account is not a BukkaGo admin.', 403);
  }

  // The database repeats the role check inside the function. Doing it here too just avoids
  // a pointless round trip and produces a clearer message in the UI.
  if (allowedRoles && !allowedRoles.includes(admin.role as AdminUser['role'])) {
    throw new AdminActionError(
      'forbidden',
      'Only a Super Admin can perform this action.',
      403
    );
  }

  const finalArgs: Record<string, unknown> = { ...args };
  if (requiresReason || reason !== undefined) {
    finalArgs.p_reason = requireReason(reason);
  }

  const { data, error } = await supabase.rpc(rpc, finalArgs);
  if (error) throw mapRpcError(error);
  if (data === null || data === undefined) {
    throw new AdminActionError('empty_result', 'The action returned no result.', 500);
  }

  return {
    data: data as T,
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role as AdminUser['role'],
    },
  };
}

/** Maps any thrown value onto a status/body pair for a route handler. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof AdminActionError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof AdminAuthError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error('[admin] unhandled error', error);
  return Response.json(
    { error: 'Something went wrong. Check the server logs.', code: 'internal_error' },
    { status: 500 }
  );
}
