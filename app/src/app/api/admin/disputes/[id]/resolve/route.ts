import { runAuditedAction, toErrorResponse } from '@/lib/admin-audit';
import { parseNumericId, readBody, str } from '@/lib/admin/route-helpers';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

const VALID_STATUSES = ['investigating', 'resolved', 'rejected'] as const;

export async function POST(request: Request, { params }: Params) {
  try {
    const disputeId = parseNumericId(params.id, 'Dispute');
    const body = await readBody(request);
    const status = str(body.status);

    // Reject here for a clear message; the function is still the authority.
    if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
      return Response.json(
        { error: 'That is not a valid dispute status.', code: 'INVALID_DISPUTE_STATUS' },
        { status: 400 }
      );
    }

    const closing = status === 'resolved' || status === 'rejected';
    const notes = str(body.resolution_notes);

    if (closing && !notes) {
      return Response.json(
        {
          error: 'Record what was decided before closing a dispute.',
          code: 'RESOLUTION_NOTES_REQUIRED',
        },
        { status: 400 }
      );
    }

    const result = await runAuditedAction<{ id: number; status: string }>({
      rpc: 'admin_resolve_dispute',
      args: {
        p_dispute_id: disputeId,
        p_status: status,
        p_resolution_notes: notes ?? null,
      },
      // The reason is optional here: the resolution notes carry the explanation, and the
      // function stores null rather than forcing a second, redundant write-up.
      requiresReason: false,
      reason: str(body.reason),
      allowedRoles: ['super_admin', 'support_admin'],
    });

    return Response.json({
      ok: true,
      message: closing
        ? `Dispute closed as ${result.data.status}.`
        : `Dispute marked as ${result.data.status}.`,
      dispute: result.data,
      auditedBy: result.admin,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
