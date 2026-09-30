import { runAuditedAction, toErrorResponse } from '@/lib/admin-audit';
import { parseUuid, readBody } from '@/lib/admin/route-helpers';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  try {
    const customerId = parseUuid(params.id, 'Customer');
    const body = await readBody(request);

    const result = await runAuditedAction<{ id: string; banned: boolean }>({
      rpc: 'admin_unban_customer',
      args: { p_customer_id: customerId },
      requiresReason: true,
      reason: body.reason,
      allowedRoles: ['super_admin', 'support_admin'],
    });

    return Response.json({
      ok: true,
      message: 'Customer unbanned and able to order again.',
      customer: result.data,
      auditedBy: result.admin,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
