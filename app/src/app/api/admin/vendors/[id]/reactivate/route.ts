import { runAuditedAction, toErrorResponse } from '@/lib/admin-audit';
import { parseNumericId, readBody } from '@/lib/admin/route-helpers';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  try {
    const vendorId = parseNumericId(params.id, 'Vendor');
    const body = await readBody(request);

    const result = await runAuditedAction<{ id: number; status: string; name: string }>({
      rpc: 'admin_reactivate_vendor',
      args: { p_vendor_id: vendorId },
      requiresReason: true,
      reason: body.reason,
      allowedRoles: ['super_admin', 'support_admin'],
    });

    return Response.json({
      ok: true,
      message: `${result.data.name} is active again and can take orders.`,
      vendor: result.data,
      auditedBy: result.admin,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
