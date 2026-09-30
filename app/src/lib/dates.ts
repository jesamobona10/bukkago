/**
 * The platform operates on West Africa Time. Postgres `timestamptz` columns and `now()`
 * are UTC, so "orders today" has to be bounded by a Lagos calendar day, not a UTC one —
 * otherwise the dashboard starts counting a new day's orders up to an hour early.
 */
export const BUSINESS_TIME_ZONE = 'Africa/Lagos';

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const field: Record<string, string> = {};
  for (const part of parts) if (part.type !== 'literal') field[part.type] = part.value;

  const asUtc = Date.UTC(
    Number(field.year),
    Number(field.month) - 1,
    Number(field.day),
    Number(field.hour) % 24,
    Number(field.minute),
    Number(field.second)
  );

  return asUtc - date.getTime();
}

function zonedDayStart(date: Date, timeZone: string): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  // Read the ymd as if it were UTC, then subtract the zone's offset at roughly that
  // instant. Africa/Lagos has no DST, so a single pass is exact.
  const guess = new Date(`${ymd}T00:00:00Z`);
  return new Date(guess.getTime() - zoneOffsetMs(guess, timeZone));
}

export function startOfToday(reference: Date = new Date()): Date {
  return zonedDayStart(reference, BUSINESS_TIME_ZONE);
}

export function startOfWeek(reference: Date = new Date()): Date {
  const today = startOfToday(reference);
  // getUTCDay on the shifted instant still yields the correct weekday for Lagos because
  // the day start was computed in local terms.
  const weekday = today.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return new Date(today.getTime() - daysSinceMonday * 86_400_000);
}

export function startOfDaysAgo(days: number, reference: Date = new Date()): Date {
  const today = startOfToday(reference);
  return new Date(today.getTime() - days * 86_400_000);
}

const NIGERIAN_LOCALE = 'en-NG';

export function formatNaira(amount: number): string {
  return `₦${Math.round(amount).toLocaleString(NIGERIAN_LOCALE)}`;
}

export function formatCompactNaira(amount: number): string {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}m`;
  if (amount >= 1_000) return `₦${Math.round(amount / 1000)}k`;
  return `₦${Math.round(amount)}`;
}

export function formatRelativeTime(iso: string, reference: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';

  const seconds = Math.round((reference.getTime() - then) / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString(NIGERIAN_LOCALE, {
    day: 'numeric',
    month: 'short',
  });
}

export function formatDateRange(from: Date, to: Date): string {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const start = from.toLocaleDateString(NIGERIAN_LOCALE, options);
  const end = to.toLocaleDateString(NIGERIAN_LOCALE, options);
  return `${start} – ${end}`;
}
