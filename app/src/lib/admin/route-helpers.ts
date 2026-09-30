import { AdminActionError } from '@/lib/admin-audit';

/**
 * Shared plumbing for the admin route handlers. Every action in Phases 2/3/5/6 follows the
 * same shape — parse an id from the URL, parse a JSON body, hand both to runAuditedAction,
 * and translate whatever it throws into a response.
 *
 * The parse helpers throw AdminActionError rather than a bespoke type, so a bad URL segment
 * flows through the same toErrorResponse path as an auth or database failure and no route
 * needs its own catch.
 */

export function parseNumericId(raw: string, label = 'Record'): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AdminActionError('invalid_id', `${label} not found.`, 404);
  }
  return id;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUuid(raw: string, label = 'Record'): string {
  if (!UUID.test(raw)) {
    throw new AdminActionError('invalid_id', `${label} not found.`, 404);
  }
  return raw.toLowerCase();
}

/**
 * Setting keys are identifiers, but they are not a closed set in the database, so allow the
 * characters a real key would use and reject anything that could confuse a log or a path.
 */
export function parseSettingKey(raw: string): string {
  const key = raw.trim();
  if (!/^[a-z0-9_.]{1,60}$/i.test(key)) {
    throw new AdminActionError('invalid_key', 'Setting not found.', 404);
  }
  return key.toLowerCase();
}

/** Reads a JSON body without throwing on a malformed or empty one. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const parsed = (await request.json().catch(() => ({}))) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

export function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
