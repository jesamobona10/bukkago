import { runAuditedAction, toErrorResponse } from '@/lib/admin-audit';
import { readBody, str } from '@/lib/admin/route-helpers';

export const dynamic = 'force-dynamic';

const VALID_ROLES = ['super_admin', 'support_admin'] as const;

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const userId = str(body.user_id);
    const email = str(body.email);
    const role = str(body.role);

    if (!userId) {
      return Response.json(
        { error: 'A user UUID is required.', code: 'USER_ID_REQUIRED' },
        { status: 400 }
      );
    }
    if (!email) {
      return Response.json({ error: 'An email address is required.', code: 'EMAIL_REQUIRED' }, { status: 400 });
    }
    if (!role || !(VALID_ROLES as readonly string[]).includes(role)) {
      return Response.json({ error: 'That is not a valid admin role.', code: 'INVALID_ROLE' }, { status: 400 });
    }

    // Phase 5 is Super-Admin-only, and the function re-checks is_super_admin() itself.
    const result = await runAuditedAction<{ id: string; email: string; role: string }>({
      rpc: 'admin_provision_admin',
      args: { p_user_id: userId, p_email: email, p_role: role },
      requiresReason: true,
      reason: body.reason,
      allowedRoles: ['super_admin'],
    });

    return Response.json({
      ok: true,
      message: `${result.data.email} is now a ${result.data.role === 'super_admin' ? 'Super Admin' : 'Support Admin'}.`,
      admin: result.data,
      auditedBy: result.admin,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
