import { runAuditedAction, toErrorResponse } from '@/lib/admin-audit';
import { parseNumericId, readBody } from '@/lib/admin/route-helpers';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  try {
    const vendorId = parseNumericId(params.id, 'Vendor');
    const body = await readBody(request);

    const result = await runAuditedAction<{
      id: number;
      status: string;
      name: string;
      in_flight_orders: number;
    }>({
      rpc: 'admin_suspend_vendor',
      args: { p_vendor_id: vendorId },
      requiresReason: true,
      reason: body.reason,
      // Both tiers handle vendor operations; only the Phase 5 screens are Super-Admin-only.
      allowedRoles: ['super_admin', 'support_admin'],
    });

    // Orders already accepted keep running (ADR-007), so the count has to be visible rather
    // than leaving an admin to wonder whether they just stranded somebody's food.
    const inFlight = result.data.in_flight_orders ?? 0;
    const message =
      inFlight > 0
        ? `${result.data.name} is suspended. ${inFlight} accepted order${
            inFlight === 1 ? '' : 's'
          } will still run to completion.`
        : `${result.data.name} is suspended. No orders were in flight.`;

    return Response.json({ ok: true, message, vendor: result.data, auditedBy: result.admin });
  } catch (error) {
    return toErrorResponse(error);
  }
}
