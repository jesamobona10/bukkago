import { runAuditedAction, toErrorResponse } from '@/lib/admin-audit';
import { parseSettingKey, readBody } from '@/lib/admin/route-helpers';

export const dynamic = 'force-dynamic';

type Params = { params: { key: string } };

export async function POST(request: Request, { params }: Params) {
  try {
    const key = parseSettingKey(params.key);
    const body = await readBody(request);

    // The function takes a jsonb value, so the client must send real JSON rather than a
    // string. `false`, `0` and `null` are all legitimate values, so test for the key's
    // presence instead of truthiness.
    if (!('value' in body)) {
      return Response.json(
        { error: 'A setting value is required.', code: 'SETTING_VALUE_REQUIRED' },
        { status: 400 }
      );
    }

    const result = await runAuditedAction<{ key: string; value: unknown; previous: unknown }>({
      rpc: 'admin_update_setting',
      args: { p_key: key, p_value: body.value },
      // admin_update_setting has no default for p_reason, so it is always sent.
      requiresReason: true,
      reason: body.reason,
      allowedRoles: ['super_admin'],
    });

    return Response.json({
      ok: true,
      message: `${result.data.key} updated.`,
      setting: result.data,
      auditedBy: result.admin,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
