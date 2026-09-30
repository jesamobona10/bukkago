import { runAuditedAction, toErrorResponse } from '@/lib/admin-audit';
import { parseUuid, readBody, str } from '@/lib/admin/route-helpers';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

const VALID_ROLES = ['super_admin', 'support_admin'] as const;

export async function POST(request: Request, { params }: Params) {
  try {
    const userId = parseUuid(params.id, 'Admin account');
    const body = await readBody(request);
    const role = str(body.role);

    if (!role || !(VALID_ROLES as readonly string[]).includes(role)) {
      return Response.json(
        { error: 'That is not a valid admin role.', code: 'INVALID_ROLE' },
        { status: 400 }
      );
    }

    const result = await runAuditedAction<{ id: string; role: string }>({
      rpc: 'admin_set_admin_role',
      args: { p_user_id: userId, p_role: role },
      requiresReason: true,
      reason: body.reason,
      allowedRoles: ['super_admin'],
    });

    return Response.json({
      ok: true,
      message: `Role changed to ${result.data.role === 'super_admin' ? 'Super Admin' : 'Support Admin'}.`,
      admin: result.data,
      auditedBy: result.admin,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
