import type {
  AdminAuditEntry,
  AdminUser,
  Dispute,
  Order,
  OrderStatus,
  Payment,
  PaymentStatus,
  Vendor,
  VendorStatus,
} from '@/lib/database.types';
import { startOfDaysAgo, startOfToday, startOfWeek } from '@/lib/dates';
import { createSupabaseServerClient, type SupabaseServerClient } from '@/lib/supabase/server';

export type StatusTally = Partial<Record<string, number>>;

export type Alert = {
  tone: 'warn' | 'alert' | 'ok';
  title: string;
  detail: string;
};

export type ActivityEntry = AdminAuditEntry & {
  admin: Pick<AdminUser, 'email' | 'role'> | null;
};

export type Overview = {
  todayStart: Date;
  weekStart: Date;

  ordersToday: number;
  orderStatusTally: StatusTally;
  revenueToday: number;
  revenueThisWeek: number;

  vendorStatusTally: StatusTally;
  pendingApplications: number;

  openDisputes: number;
  noShowRate: number;
  noShowSample: number;

  alerts: Alert[];
  activity: ActivityEntry[];
};

function tally<T extends string>(rows: T[]): StatusTally {
  const counts: StatusTally = {};
  for (const row of rows) counts[row] = (counts[row] ?? 0) + 1;
  return counts;
}

function paidTotal(orders: Pick<Order, 'total_amount' | 'payment_status'>[]): number {
  return orders
    .filter((order) => order.payment_status === 'paid')
    .reduce((sum, order) => sum + Number(order.total_amount), 0);
}

/** Orders whose total is capped at 1000 rows, which is far past pilot volume. */
const ORDER_FIELDS = 'id, status, total_amount, payment_status, created_at';

export async function loadOverview(
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<Overview> {
  const todayStart = startOfToday();
  const weekStart = startOfWeek();
  const thirtyDaysAgo = startOfDaysAgo(30).toISOString();
  const todayIso = todayStart.toISOString();
  const weekIso = weekStart.toISOString();

  const [
    { data: todayOrders },
    { data: weekOrders },
    { data: recentOrders },
    { data: vendors },
    { data: disputes },
    { data: failedPayments },
    { data: activity },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select(ORDER_FIELDS)
      .gte('created_at', todayIso)
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select(ORDER_FIELDS)
      .gte('created_at', weekIso)
      .lt('created_at', todayIso),
    supabase
      .from('orders')
      .select('id, status, created_at')
      .gte('created_at', thirtyDaysAgo)
      .in('status', ['collected', 'no_show']),
    supabase.from('vendors').select('id, status, name, area').order('created_at', {
      ascending: false,
    }),
    supabase
      .from('disputes')
      .select('id, order_id, dispute_type, status, created_at')
      .in('status', ['open', 'investigating'])
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('id, order_id, provider, provider_reference, amount, status, created_at')
      .eq('status', 'failed')
      .gte('created_at', startOfDaysAgo(7).toISOString())
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('admin_audit_log')
      .select(
        'id, admin_id, action, target_table, target_id, before_state, after_state, reason, created_at, admin_users(email, role)'
      )
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const ordersTodayRows = (todayOrders ?? []) as Order[];
  const weekRows = (weekOrders ?? []) as Order[];
  const recentRows = (recentOrders ?? []) as Pick<Order, 'id' | 'status'>[];
  const vendorRows = (vendors ?? []) as Vendor[];
  const disputeRows = (disputes ?? []) as Dispute[];
  const failedPaymentRows = (failedPayments ?? []) as Payment[];

  const collected = recentRows.filter((order) => order.status === 'collected').length;
  const noShows = recentRows.filter((order) => order.status === 'no_show').length;
  const resolvedPickups = collected + noShows;
  const noShowRate = resolvedPickups === 0 ? 0 : noShows / resolvedPickups;

  return {
    todayStart,
    weekStart,
    ordersToday: ordersTodayRows.length,
    orderStatusTally: tally(ordersTodayRows.map((order) => order.status)),
    revenueToday: paidTotal(ordersTodayRows),
    revenueThisWeek: paidTotal([...weekRows, ...ordersTodayRows]),
    vendorStatusTally: tally(vendorRows.map((vendor) => vendor.status)),
    pendingApplications: vendorRows.filter((vendor) => vendor.status === 'pending').length,
    openDisputes: disputeRows.length,
    noShowRate,
    noShowSample: resolvedPickups,
    alerts: buildAlerts({
      failedPayments: failedPaymentRows,
      disputes: disputeRows,
      noShowRate,
      noShowSample: resolvedPickups,
      pendingApplications: vendorRows.filter((vendor) => vendor.status === 'pending').length,
    }),
    activity: ((activity ?? []) as unknown as ActivityEntry[]) ?? [],
  };
}

function buildAlerts(input: {
  failedPayments: Payment[];
  disputes: Dispute[];
  noShowRate: number;
  noShowSample: number;
  pendingApplications: number;
}): Alert[] {
  const alerts: Alert[] = [];

  if (input.failedPayments.length > 0) {
    const total = input.failedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    alerts.push({
      tone: 'alert',
      title: `${input.failedPayments.length} failed payment${
        input.failedPayments.length === 1 ? '' : 's'
      } in the last 7 days`,
      detail: `₦${Math.round(total).toLocaleString('en-NG')} across ${input.failedPayments.length} order${
        input.failedPayments.length === 1 ? '' : 's'
      }. Check whether the webhook is rejecting these or customers are being charged twice.`,
    });
  }

  if (input.disputes.length > 0) {
    alerts.push({
      tone: 'warn',
      title: `${input.disputes.length} open dispute${input.disputes.length === 1 ? '' : 's'}`,
      detail: 'Waiting on a decision. The dispute queue arrives in Phase 3.',
    });
  }

  if (input.pendingApplications > 0) {
    alerts.push({
      tone: 'warn',
      title: `${input.pendingApplications} vendor application${
        input.pendingApplications === 1 ? '' : 's'
      } awaiting review`,
      detail: 'Vendors stay invisible to customers until an admin approves them.',
    });
  }

  // Only meaningful with a real denominator — a single no-show is 100% and says nothing.
  if (input.noShowSample >= 20 && input.noShowRate > 0.2) {
    alerts.push({
      tone: 'alert',
      title: `No-show rate at ${Math.round(input.noShowRate * 100)}% over 30 days`,
      detail: `Based on ${input.noShowSample} orders that reached Ready. This is the PRD's core success metric — worth investigating before the pilot widens.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      tone: 'ok',
      title: 'No open platform alerts',
      detail: 'No failed payments, disputes, or overdue vendor applications in the last 7 days.',
    });
  }

  return alerts;
}
