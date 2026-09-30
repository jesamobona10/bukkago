import { runAuditedAction, toErrorResponse } from '@/lib/admin-audit';
import { parseNumericId, readBody } from '@/lib/admin/route-helpers';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

type StockEntry = { menu_item_id: number; name: string; quantity: number };

export async function POST(request: Request, { params }: Params) {
  try {
    const orderId = parseNumericId(params.id, 'Order');
    const body = await readBody(request);

    const result = await runAuditedAction<{
      id: number;
      status: string;
      stock_restored: StockEntry[];
      slot_released: boolean;
    }>({
      rpc: 'admin_force_cancel_order',
      args: { p_order_id: orderId },
      requiresReason: true,
      reason: body.reason,
      allowedRoles: ['super_admin', 'support_admin'],
    });

    // The function restores vendor stock and frees the pickup slot, so report exactly what
    // it did — an admin cancelling an order needs to know the capacity came back.
    const restored = result.data.stock_restored ?? [];
    const bits: string[] = [];
    if (restored.length > 0) {
      const units = restored.reduce((sum, entry) => sum + Number(entry.quantity ?? 0), 0);
      bits.push(`${units} item${units === 1 ? '' : 's'} returned to vendor stock`);
    }
    if (result.data.slot_released) bits.push('pickup slot released');

    return Response.json({
      ok: true,
      message: `Order cancelled${
        bits.length > 0 ? ` — ${bits.join(', ')}.` : '. Nothing needed restocking.'
      }`,
      order: result.data,
      auditedBy: result.admin,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
