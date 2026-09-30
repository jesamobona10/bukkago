import type {
  AdminAuditEntry,
  AdminUser,
  Customer,
  Dispute,
  DisputeStatus,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentStatus,
  PlatformSetting,
  Vendor,
  VendorStatus,
} from '@/lib/database.types';
import { createSupabaseServerClient, type SupabaseServerClient } from '@/lib/supabase/server';

/**
 * One place for list paging, filtering and search, so every admin screen behaves the same
 * way and pagination state lives in the URL rather than in component state. The URL is the
 * point: an admin can bookmark or share "orders?status=pending&page=3" and an audit row can
 * link straight to the filtered view it came from.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * PostgREST returns an embedded many-to-one relation as a one-element array, and the
 * generated-but-untyped client models it as an array even where the relationship is
 * `many-to-one`. Normalise it, and treat a missing parent as null rather than a stray array.
 */
function one<T>(value: T[] | T | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type Page = { page: number; pageSize: number; offset: number };

export function parsePage(sp: SearchParams, pageSize: number): Page {
  const raw = Number.parseInt(first(sp.page) ?? '1', 10);
  const page = Number.isInteger(raw) && raw > 0 ? raw : 1;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
};

export function paged<T>(rows: T[] | null, total: number | null, page: Page): Paged<T> {
  const count = total ?? rows?.length ?? 0;
  return {
    rows: rows ?? [],
    total: count,
    page: page.page,
    pageSize: page.pageSize,
    pages: Math.max(1, Math.ceil(count / page.pageSize)),
  };
}

/** Only accepts a value from a known set, so a crafted query string cannot widen a filter. */
export function parseFilter(
  sp: SearchParams,
  key: string,
  allowed: readonly string[]
): string | null {
  const value = first(sp[key]);
  return value && allowed.includes(value) ? value : null;
}

/**
 * PostgREST's `.or()` takes a mini query language, so an unescaped search term is a filter
 * injection point: a comma or paren in the box would let a term append its own clauses.
 * Reduce the input to characters that cannot terminate a clause before interpolating.
 */
export function parseTerm(sp: SearchParams, key = 'q'): string {
  const raw = first(sp[key]) ?? '';
  return raw
    .replace(/[,()'"\\*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export function contains(term: string, ...columns: string[]): string | null {
  if (!term) return null;
  return columns.map((column) => `${column}.ilike.%${term}%`).join(',');
}

// ---------------------------------------------------------------- vendors

export const VENDOR_STATUSES: readonly VendorStatus[] = [
  'pending',
  'active',
  'suspended',
  'rejected',
];

const VENDOR_LIST_FIELDS =
  'id, name, area, address, phone, description, status, suspended_at, suspended_reason, avg_prep_time_minutes, created_at';

export type VendorListFilters = {
  status: VendorStatus | 'all';
  term: string;
};

export async function loadVendors(
  sp: SearchParams,
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<Paged<Vendor> & { filters: VendorListFilters }> {
  const page = parsePage(sp, 25);
  const status = (parseFilter(sp, 'status', VENDOR_STATUSES) ?? 'all') as
    | VendorStatus
    | 'all';
  const term = parseTerm(sp);

  let query = supabase
    .from('vendors')
    .select(VENDOR_LIST_FIELDS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page.offset, page.offset + page.pageSize - 1);

  if (status !== 'all') query = query.eq('status', status);
  const orFilter = contains(term, 'name', 'area', 'address');
  if (orFilter) query = query.or(orFilter);

  const { data, count, error } = await query;
  if (error) console.error('[admin] could not load vendors', error);

  return { ...paged(data as Vendor[] | null, count, page), filters: { status, term } };
}

export type VendorDetail = {
  vendor: Vendor;
  orderCount: number;
  revenue: number;
  noShows: number;
  menuCount: number;
  openSlots: number;
  recentOrders: (Order & { order_items: { quantity: number }[] })[];
  inFlight: number;
  suspensionAdmin: Pick<AdminUser, 'email' | 'role'> | null;
};

export async function loadVendorDetail(
  vendorId: number,
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<VendorDetail | null> {
  const { data: vendor, error } = await supabase
    .from('vendors')
    .select(
      'id, name, description, logo_url, area, address, phone, avg_prep_time_minutes, status, suspended_at, suspended_reason, suspended_by, commission_rate, created_at, suspended_admin:suspended_by(email, role)'
    )
    .eq('id', vendorId)
    .maybeSingle();

  if (error) {
    console.error('[admin] could not load vendor', error);
    return null;
  }
  if (!vendor) return null;

  const [orders, menu, slots] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, total_amount, payment_status, created_at, order_items(quantity)')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId),
    supabase
      .from('pickup_slots')
      .select('id, capacity, orders_count')
      .eq('vendor_id', vendorId)
      .gte('slot_date', new Date().toISOString().slice(0, 10)),
  ]);

  const orderRows = (orders.data ?? []) as VendorDetail['recentOrders'];

  return {
    vendor: vendor as Vendor,
    orderCount: orderRows.length,
    revenue: orderRows
      .filter((order) => order.payment_status === 'paid')
      .reduce((sum, order) => sum + Number(order.total_amount), 0),
    noShows: orderRows.filter((order) => order.status === 'no_show').length,
    menuCount: menu.count ?? 0,
    openSlots: (slots.data ?? []).reduce(
      (sum, slot) => sum + Math.max(0, slot.capacity - slot.orders_count),
      0
    ),
    recentOrders: orderRows.slice(0, 12),
    inFlight: orderRows.filter((order) =>
      ['accepted', 'preparing', 'ready'].includes(order.status)
    ).length,
    suspensionAdmin: one((vendor as { suspension_admin?: unknown }).suspension_admin) as VendorDetail['suspensionAdmin'],
  };
}

// -------------------------------------------------------------- customers

export async function loadCustomers(
  sp: SearchParams,
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<Paged<Customer> & { bannedOnly: boolean }> {
  const page = parsePage(sp, 25);
  const bannedOnly = first(sp.banned) === '1';
  const term = parseTerm(sp);

  let query = supabase
    .from('customers')
    .select('id, name, phone, banned_at, banned_reason, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page.offset, page.offset + page.pageSize - 1);

  if (bannedOnly) query = query.not('banned_at', 'is', null);
  // uuid and phone have no useful ilike, so a term can only narrow name.
  const orFilter = contains(term, 'name');
  if (orFilter) query = query.or(orFilter);

  const { data, count, error } = await query;
  if (error) console.error('[admin] could not load customers', error);

  return { ...paged(data as Customer[] | null, count, page), bannedOnly };
}

export type CustomerDetail = {
  customer: Customer;
  orderCount: number;
  spend: number;
  noShows: number;
  openDisputes: number;
  recentOrders: (Order & { vendors: { name: string } | null })[];
  banAdmin: Pick<AdminUser, 'email' | 'role'> | null;
};

export async function loadCustomerDetail(
  customerId: string,
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<CustomerDetail | null> {
  const { data: customer, error } = await supabase
    .from('customers')
    .select(
      'id, name, phone, banned_at, banned_reason, banned_by, created_at, ban_admin:banned_by(email, role)'
    )
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    console.error('[admin] could not load customer', error);
    return null;
  }
  if (!customer) return null;

  const [orders, disputes] = await Promise.all([
    supabase
      .from('orders')
      .select('id, vendor_id, status, total_amount, payment_status, created_at, vendors(name)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('disputes')
      .select('id', { count: 'exact', head: true })
      .eq('raised_by_id', customerId)
      .in('status', ['open', 'investigating']),
  ]);

  const orderRows = ((orders.data ?? []) as unknown[]) as CustomerDetail['recentOrders'];

  return {
    customer: customer as Customer,
    orderCount: orderRows.length,
    spend: orderRows
      .filter((order) => order.payment_status === 'paid')
      .reduce((sum, order) => sum + Number(order.total_amount), 0),
    noShows: orderRows.filter((order) => order.status === 'no_show').length,
    openDisputes: disputes.count ?? 0,
    recentOrders: orderRows.slice(0, 12),
    banAdmin: one(customer.ban_admin) as CustomerDetail['banAdmin'],
  };
}

// ----------------------------------------------------------------- orders

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'preparing',
  'ready',
  'collected',
  'cancelled',
  'no_show',
];

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'unpaid',
  'paid',
  'refunded',
  'failed',
];

const ORDER_LIST_FIELDS =
  'id, customer_id, vendor_id, status, pickup_code, total_amount, payment_status, created_at, vendors(name)';

export type OrderListFilters = {
  status: OrderStatus | 'all';
  payment: PaymentStatus | 'all';
  term: string;
};

export async function loadOrders(
  sp: SearchParams,
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<Paged<Order & { vendors: { name: string } | null }> & { filters: OrderListFilters }> {
  const page = parsePage(sp, 25);
  const status = (parseFilter(sp, 'status', ORDER_STATUSES) ?? 'all') as
    | OrderStatus
    | 'all';
  const payment = (parseFilter(sp, 'payment', PAYMENT_STATUSES) ?? 'all') as
    | PaymentStatus
    | 'all';
  const term = parseTerm(sp);

  let query = supabase
    .from('orders')
    .select(ORDER_LIST_FIELDS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page.offset, page.offset + page.pageSize - 1);

  if (status !== 'all') query = query.eq('status', status);
  if (payment !== 'all') query = query.eq('payment_status', payment);
  if (term) {
    // Numeric ids and the pickup code are what an admin actually searches on; the vendor
    // name is the third option. Anything non-numeric is matched against the code alone,
    // because a numeric-only column throws on a non-numeric ilike.
    if (/^\d+$/.test(term)) {
      query = query.or(`id.eq.${term},pickup_code.ilike.%${term}%`);
    } else {
      query = query.or(`pickup_code.ilike.%${term}%`);
    }
  }

  const { data, count, error } = await query;
  if (error) console.error('[admin] could not load orders', error);

  type OrderRow = Order & { vendors: { name: string } | null };
  const rows = ((data ?? []) as unknown[]).map((row) => {
    const order = row as OrderRow;
    return { ...order, vendors: one(order.vendors) };
  }) as OrderRow[];

  return { ...paged(rows, count, page), filters: { status, payment, term } };
}

export type OrderDetail = {
  order: Order & { vendors: { name: string; area: string | null } | null };
  items: OrderItem[];
  payments: Payment[];
  disputes: Dispute[];
  customer: Pick<Customer, 'id' | 'name' | 'phone' | 'banned_at'> | null;
};

export async function loadOrderDetail(
  orderId: number,
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<OrderDetail | null> {
  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, customer_id, vendor_id, pickup_slot_id, status, pickup_code, total_amount, payment_status, idempotency_key, rejection_reason, accepted_at, ready_at, collected_at, cancelled_at, created_at, vendors(name, area)'
    )
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    console.error('[admin] could not load order', error);
    return null;
  }
  if (!order) return null;

  const [items, payments, disputes] = await Promise.all([
    supabase
      .from('order_items')
      .select('id, order_id, name_snapshot, price_snapshot, quantity, subtotal')
      .eq('order_id', orderId),
    supabase
      .from('payments')
      .select('id, order_id, provider, provider_reference, amount, status, created_at')
      .eq('order_id', orderId),
    supabase
      .from('disputes')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
  ]);

  const customerId = (order as Order).customer_id;
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, phone, banned_at')
    .eq('id', customerId)
    .maybeSingle();

  const orderRow = order as unknown as OrderDetail['order'];

  return {
    order: { ...orderRow, vendors: one(orderRow.vendors) },
    items: (items.data ?? []) as OrderItem[],
    payments: (payments.data ?? []) as Payment[],
    disputes: (disputes.data ?? []) as Dispute[],
    customer: (customer ?? null) as OrderDetail['customer'],
  };
}

// --------------------------------------------------------------- disputes

export const DISPUTE_STATUSES: readonly DisputeStatus[] = [
  'open',
  'investigating',
  'resolved',
  'rejected',
];

export type DisputeListFilters = { status: DisputeStatus | 'all' };

export async function loadDisputes(
  sp: SearchParams,
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<Paged<Dispute & { orders: { vendors: { name: string } | null } | null }> & {
  filters: DisputeListFilters;
}> {
  const page = parsePage(sp, 25);
  const status = (parseFilter(sp, 'status', DISPUTE_STATUSES) ?? 'all') as
    | DisputeStatus
    | 'all';

  let query = supabase
    .from('disputes')
    .select(
      'id, order_id, raised_by_type, dispute_type, description, status, created_at, orders(id, pickup_code, total_amount, vendors(name))',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(page.offset, page.offset + page.pageSize - 1);

  if (status !== 'all') query = query.eq('status', status);

  const { data, count, error } = await query;
  if (error) console.error('[admin] could not load disputes', error);

  type DisputeRow = Dispute & { orders: { vendors: { name: string } | null } | null };
  const rows = ((data ?? []) as unknown[]).map((row) => {
    const dispute = row as DisputeRow;
    const order = one(dispute.orders);
    return { ...dispute, orders: order ? { ...order, vendors: one(order.vendors) } : null };
  }) as DisputeRow[];

  return { ...paged(rows, count, page), filters: { status } };
}

export type DisputeDetail = {
  dispute: Dispute;
  order: (Order & { vendors: { name: string; area: string | null } | null }) | null;
  raiser: { email: string } | null;
  resolver: Pick<AdminUser, 'email' | 'role'> | null;
};

export async function loadDisputeDetail(
  disputeId: number,
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<DisputeDetail | null> {
  const { data: dispute, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('id', disputeId)
    .maybeSingle();

  if (error) {
    console.error('[admin] could not load dispute', error);
    return null;
  }
  if (!dispute) return null;

  const orderId = (dispute as Dispute).order_id;
  const [{ data: order }, { data: resolver }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, vendor_id, customer_id, status, pickup_code, total_amount, payment_status, created_at, vendors(name, area)')
      .eq('id', orderId)
      .maybeSingle(),
    (dispute as Dispute).resolved_by
      ? supabase
          .from('admin_users')
          .select('email, role')
          .eq('id', (dispute as Dispute).resolved_by as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // raised_by_id points at auth.users, which no RLS policy exposes, so the raiser's identity
  // is only shown when they are also an admin we can read.
  const raisedBy = (dispute as Dispute).raised_by_id;
  const { data: raiser } = raisedBy
    ? await supabase
        .from('admin_users')
        .select('email')
        .eq('id', raisedBy)
        .maybeSingle()
    : { data: null };

  const orderRow = order ? (order as unknown as DisputeDetail['order']) : null;

  return {
    dispute: dispute as Dispute,
    order: orderRow ? { ...orderRow, vendors: one(orderRow.vendors) } : null,
    raiser: (raiser ?? null) as { email: string } | null,
    resolver: (resolver ?? null) as DisputeDetail['resolver'],
  };
}

// ------------------------------------------------- admins, settings, audit

export async function loadAdmins(
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, email, role, created_at')
    .order('created_at', { ascending: true });

  if (error) console.error('[admin] could not load admin accounts', error);
  return (data ?? []) as AdminUser[];
}

export type SettingRow = PlatformSetting & { editor: { email: string } | null };

export async function loadSettings(
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<SettingRow[]> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value, updated_by, updated_at, editor:updated_by(email)')
    .order('key', { ascending: true });

  if (error) console.error('[admin] could not load settings', error);
  return ((data ?? []) as unknown[]).map((row) => {
    const setting = row as SettingRow;
    return { ...setting, editor: one(setting.editor) };
  }) as SettingRow[];
}

export type AuditRow = AdminAuditEntry & {
  admin: Pick<AdminUser, 'email' | 'role'> | null;
};

export type AuditFilters = { action: string; target: string; term: string };

export async function loadAuditLog(
  sp: SearchParams,
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<Paged<AuditRow> & { filters: AuditFilters }> {
  const page = parsePage(sp, 50);
  const action = (first(sp.action) ?? '').replace(/[^a-z._]/g, '').slice(0, 40);
  const target = (first(sp.target) ?? '').replace(/[^a-z_]/g, '').slice(0, 40);
  const term = parseTerm(sp);

  let query = supabase
    .from('admin_audit_log')
    .select(
      'id, admin_id, action, target_table, target_id, before_state, after_state, reason, created_at, admin_users(email, role)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(page.offset, page.offset + page.pageSize - 1);

  if (action) query = query.eq('action', action);
  if (target) query = query.eq('target_table', target);
  const orFilter = contains(term, 'reason', 'target_id');
  if (orFilter) query = query.or(orFilter);

  const { data, count, error } = await query;
  if (error) console.error('[admin] could not load the audit log', error);

  const rows = ((data ?? []) as unknown[]).map((row) => {
    const entry = row as AuditRow;
    return { ...entry, admin: one(entry.admin) };
  }) as AuditRow[];

  return { ...paged(rows, count, page), filters: { action, target, term } };
}

/** Distinct action names present in the log, for the filter dropdown. */
export async function loadAuditActions(
  supabase: SupabaseServerClient = createSupabaseServerClient()
): Promise<string[]> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('action')
    .order('action', { ascending: true })
    .limit(500);

  if (error) return [];
  const actions = (data ?? []).map((row) => (row as { action: string }).action);
  return Array.from(new Set(actions)).sort();
}
