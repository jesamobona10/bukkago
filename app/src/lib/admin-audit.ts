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

/** Every SECURITY DEFINER function in migrations 002 and 003 that an admin may call. */
export type AuditedRpc =
  // migration 002 — vendor application review
  | 'admin_approve_vendor'
  | 'admin_reject_vendor'
  // migration 003 — vendor oversight
  | 'admin_suspend_vendor'
  | 'admin_reactivate_vendor'
  | 'admin_provision_vendor'
  // migration 003 — customer bans
  | 'admin_ban_customer'
  | 'admin_unban_customer'
  // migration 003 — order and dispute intervention
  | 'admin_force_cancel_order'
  | 'admin_resolve_dispute'
  // migration 003 — super-admin-only
  | 'admin_provision_admin'
  | 'admin_set_admin_role'
  | 'admin_update_setting';

const RPC_ERRORS: Record<string, { status: number; message: string }> = {
  FORBIDDEN: { status: 403, message: 'You are not allowed to perform this action.' },
  REASON_REQUIRED: {
    status: 400,
    message: 'A reason is required and is recorded in the audit log.',
  },
  // vendors
  VENDOR_NOT_FOUND: { status: 404, message: 'Vendor not found.' },
  VENDOR_NOT_PENDING: {
    status: 409,
    message: 'That application has already been decided. Reload and try again.',
  },
  VENDOR_NOT_SUSPENDABLE: {
    status: 409,
    message: 'Only a pending or active vendor can be suspended. Reload and try again.',
  },
  VENDOR_NOT_SUSPENDED: {
    status: 409,
    message: 'That vendor is not currently suspended.',
  },
  VENDOR_NAME_REQUIRED: { status: 400, message: 'A vendor name is required.' },
  // customers
  CUSTOMER_NOT_FOUND: { status: 404, message: 'Customer not found.' },
  CUSTOMER_ALREADY_BANNED: { status: 409, message: 'That customer is already banned.' },
  CUSTOMER_NOT_BANNED: { status: 409, message: 'That customer is not banned.' },
  // orders
  ORDER_NOT_FOUND: { status: 404, message: 'Order not found.' },
  ORDER_ALREADY_CLOSED: {
    status: 409,
    message: 'That order is already closed, so there is nothing to cancel.',
  },
  VENDOR_NOT_OPERATIONAL: {
    status: 409,
    message: 'That vendor is suspended and cannot accept new orders.',
  },
  // disputes
  DISPUTE_NOT_FOUND: { status: 404, message: 'Dispute not found.' },
  DISPUTE_ALREADY_CLOSED: {
    status: 409,
    message: 'That dispute has already been closed.',
  },
  INVALID_DISPUTE_STATUS: { status: 400, message: 'That is not a valid dispute status.' },
  RESOLUTION_NOTES_REQUIRED: {
    status: 400,
    message: 'Record what was decided before closing a dispute.',
  },
  // admins and settings
  ADMIN_NOT_FOUND: { status: 404, message: 'That admin account no longer exists.' },
  ADMIN_ALREADY_EXISTS: {
    status: 409,
    message: 'That user is already an admin.',
  },
  AUTH_USER_NOT_FOUND: {
    status: 404,
    message: 'No Supabase Auth user has that UUID. Create the user first.',
  },
  USER_ID_REQUIRED: { status: 400, message: 'A user UUID is required.' },
  EMAIL_REQUIRED: { status: 400, message: 'An email address is required.' },
  INVALID_ROLE: { status: 400, message: 'That is not a valid admin role.' },
  ROLE_UNCHANGED: { status: 409, message: 'That account already has that role.' },
  LAST_SUPER_ADMIN: {
    status: 409,
    message: 'This is the only Super Admin. Promote someone else first, or you will lock everyone out.',
  },
  SETTING_NOT_FOUND: { status: 404, message: 'That setting does not exist.' },
  SETTING_KEY_REQUIRED: { status: 400, message: 'A setting key is required.' },
  SETTING_VALUE_REQUIRED: { status: 400, message: 'A setting value is required.' },
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

  // Filtered on the caller's own id: RLS lets any admin read admin_users, but this query has
  // no id argument, so it can only ever return the caller's own row.
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
    const names = allowedRoles.map((role) => (role === 'super_admin' ? 'Super Admin' : 'Support Admin'));
    throw new AdminActionError(
      'forbidden',
      `This action is restricted to ${names.join(' or ')}.`,
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
