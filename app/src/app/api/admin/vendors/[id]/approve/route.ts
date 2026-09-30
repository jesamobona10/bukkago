import { runAuditedAction, toErrorResponse } from '@/lib/admin-audit';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

function parseVendorId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('INVALID_VENDOR_ID');
  }
  return id;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const vendorId = parseVendorId(params.id);
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };

    const result = await runAuditedAction<{ id: number; status: string; name: string }>({
      rpc: 'admin_approve_vendor',
      args: { p_vendor_id: vendorId },
      requiresReason: true,
      reason: body.reason,
      // Spec §5: both tiers may approve a vendor application.
      allowedRoles: ['super_admin', 'support_admin'],
    });

    return Response.json({
      ok: true,
      vendor: result.data,
      auditedBy: result.admin,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_VENDOR_ID') {
      return Response.json({ error: 'Invalid vendor id.', code: 'invalid_id' }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}
