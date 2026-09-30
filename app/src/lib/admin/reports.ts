import type { Dispute, Order, OrderStatus, Vendor, VendorStatus } from '@/lib/database.types';
import { startOfDaysAgo, startOfToday } from '@/lib/dates';
import { createSupabaseServerClient, type SupabaseServerClient } from '@/lib/supabase/server';

/**
 * Phase 6 reporting. Computed in the server from raw rows rather than by adding aggregate
 * views: the pilot dataset is small, and an audited view is far easier to reason about when
 * the numbers are the same code that renders them.
 *
 * Everything here is a read. Reports never write, so they need no audited RPC.
 */

export type Range = 7 | 30 | 90;

const ORDER_FIELDS = 'id, vendor_id, customer_id, status, payment_status, total_amount, created_at';
const VENDOR_FIELDS = 'id, name, status, area, created_at';
const DISPUTE_FIELDS = 'id, order_id, dispute_type, status, created_at';

export type VendorPerformance = {
  vendor: Pick<Vendor, 'id' | 'name' | 'area' | 'status'>;
  orders: number;
  revenue: number;
  noShows: number;
  noShowRate: number;
  completionRate: number;
};

export type DayPoint = {
  day: string;
  orders: number;
  revenue: number;
};

export type Report = {
  range: Range;
  since: string;

  orders: number;
  revenue: number;
  averageOrder: number;
  noShows: number;
  noShowRate: number;
  cancellationRate: number;

  /** Orders that reached a final pickup outcome — the denominator for the no-show rate. */
  resolvedPickups: number;

  customers: number;
  newCustomers: number;
  activeVendors: number;
  newVendors: number;
  pendingApplications: number;

  disputes: number;
  disputesPerOrder: number;
  disputeBreakdown: { type: string; count: number }[];

  daily: DayPoint[];
  topVendors: VendorPerformance[];
  worstVendors: VendorPerformance[];
};

/** Statuses that count as a successfully completed pickup. */
const COMPLETED = new Set<OrderStatus>(['collected']);
const CANCELLED = new Set<OrderStatus>(['cancelled', 'rejected', 'no_show']);

function ymd(date: Date): string {
  // en-CA formats as YYYY-MM-DD, which is what the daily buckets group on.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function paidTotal(orders: Pick<Order, 'total_amount' | 'payment_status'>[]): number {
  return orders
    .filter((order) => order.payment_status === 'paid')
    .reduce((sum, order) => sum + Number(order.total_amount), 0);
}

export async function loadReport(
  range: Range = 30,
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<Report> {
  const since = startOfDaysAgo(range).toISOString();
  const today = startOfToday();

  const [ordersResult, vendorsResult, disputesResult, customersResult] = await Promise.all([
    supabase
      .from('orders')
      .select(ORDER_FIELDS)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(2000),
    supabase.from('vendors').select(VENDOR_FIELDS).limit(500),
    supabase
      .from('disputes')
      .select(DISPUTE_FIELDS)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(1000),
    supabase.from('customers').select('id, created_at').limit(2000),
  ]);

  const orders = (ordersResult.data ?? []) as Order[];
  const vendors = (vendorsResult.data ?? []) as Vendor[];
  const disputes = (disputesResult.data ?? []) as Dispute[];
  const customers = (customersResult.data ?? []) as { id: string; created_at: string }[];

  // ---- headline numbers
  const revenue = paidTotal(orders);
  const noShows = orders.filter((order) => order.status === 'no_show').length;
  // A no-show rate over the raw order count is misleading: cancelled orders never reached
  // the pickup counter, so they are not a chance to no-show. Use resolved pickups only.
  const resolvedPickups = orders.filter(
    (order) => COMPLETED.has(order.status) || order.status === 'no_show'
  ).length;
  const cancelled = orders.filter((order) => CANCELLED.has(order.status)).length;

  // ---- daily buckets
  const days = Array.from({ length: range }, (_, i) => ymd(new Date(today.getTime() - (range - 1 - i) * 86_400_000)));
  const daily: DayPoint[] = days.map((day) => ({ day, orders: 0, revenue: 0 }));
  const bucketByDay = new Map(daily.map((point) => [point.day, point]));

  for (const order of orders) {
    const bucket = bucketByDay.get(ymd(new Date(order.created_at)));
    if (!bucket) continue;
    bucket.orders += 1;
    if (order.payment_status === 'paid') bucket.revenue += Number(order.total_amount);
  }

  // ---- vendor performance
  const ordersByVendor = new Map<number, Order[]>();
  for (const order of orders) {
    const list = ordersByVendor.get(order.vendor_id) ?? [];
    list.push(order);
    ordersByVendor.set(order.vendor_id, list);
  }

  const performance: VendorPerformance[] = vendors
    .map((vendor) => {
      const rows = ordersByVendor.get(vendor.id) ?? [];
      const vendorNoShows = rows.filter((order) => order.status === 'no_show').length;
      const vendorResolved = rows.filter(
        (order) => COMPLETED.has(order.status) || order.status === 'no_show'
      ).length;
      const completed = rows.filter((order) => COMPLETED.has(order.status)).length;

      return {
        vendor: {
          id: vendor.id,
          name: vendor.name,
          area: vendor.area,
          status: vendor.status as VendorStatus,
        },
        orders: rows.length,
        revenue: paidTotal(rows),
        noShows: vendorNoShows,
        noShowRate: vendorResolved === 0 ? 0 : vendorNoShows / vendorResolved,
        completionRate: rows.length === 0 ? 0 : completed / rows.length,
      };
    })
    .filter((row) => row.orders > 0);

  const ranked = [...performance].sort((a, b) => b.orders - a.orders);
  const worst = [...performance]
    .filter((row) => row.noShowRate > 0 || row.orders >= 3)
    .sort((a, b) => b.noShowRate - a.noShowRate || b.orders - a.orders)
    .slice(0, 5);

  // ---- dispute breakdown
  const typeCounts = new Map<string, number>();
  for (const dispute of disputes) {
    typeCounts.set(dispute.dispute_type, (typeCounts.get(dispute.dispute_type) ?? 0) + 1);
  }
  const disputeBreakdown = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const sinceMs = new Date(since).getTime();

  return {
    range,
    since,
    orders: orders.length,
    revenue,
    averageOrder: orders.length === 0 ? 0 : revenue / orders.length,
    noShows,
    noShowRate: resolvedPickups === 0 ? 0 : noShows / resolvedPickups,
    resolvedPickups,
    cancellationRate: orders.length === 0 ? 0 : cancelled / orders.length,

    customers: customers.length,
    newCustomers: customers.filter((customer) => new Date(customer.created_at).getTime() >= sinceMs)
      .length,
    activeVendors: vendors.filter((vendor) => vendor.status === 'active').length,
    newVendors: vendors.filter((vendor) => new Date(vendor.created_at).getTime() >= sinceMs)
      .length,
    pendingApplications: vendors.filter((vendor) => vendor.status === 'pending').length,

    disputes: disputes.length,
    disputesPerOrder: orders.length === 0 ? 0 : disputes.length / orders.length,
    disputeBreakdown,

    daily,
    topVendors: ranked.slice(0, 8),
    worstVendors: worst,
  };
}
