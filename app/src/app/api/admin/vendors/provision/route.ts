import { runAuditedAction, toErrorResponse } from '@/lib/admin-audit';
import { readBody, str } from '@/lib/admin/route-helpers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const name = str(body.name);

    if (!name) {
      return Response.json(
        { error: 'A vendor name is required.', code: 'VENDOR_NAME_REQUIRED' },
        { status: 400 }
      );
    }

    const result = await runAuditedAction<{ id: number; status: string; name: string }>({
      rpc: 'admin_provision_vendor',
      args: {
        p_name: name,
        p_area: str(body.area) ?? null,
        p_phone: str(body.phone) ?? null,
        p_address: str(body.address) ?? null,
        p_description: str(body.description) ?? null,
      },
      requiresReason: true,
      reason: body.reason,
      allowedRoles: ['super_admin', 'support_admin'],
    });

    // Provisioned vendors land as `pending` like any applicant, so a human still confirms
    // the details. Do not route straight to active.
    return Response.json({
      ok: true,
      message: `${result.data.name} was created as a pending application. Review and approve it to go live.`,
      vendor: result.data,
      auditedBy: result.admin,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
