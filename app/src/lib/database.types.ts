export type AdminRole = 'super_admin' | 'support_admin';

export type VendorStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'preparing'
  | 'ready'
  | 'collected'
  | 'cancelled'
  | 'no_show';

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'failed';

export type AdminUser = {
  id: string;
  email: string;
  role: AdminRole;
  created_at: string;
};

export type Vendor = {
  id: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  area: string | null;
  address: string | null;
  phone: string | null;
  avg_prep_time_minutes: number;
  status: VendorStatus;
  suspended_at: string | null;
  suspended_reason: string | null;
  suspended_by: string | null;
  commission_rate: string | null;
  created_at: string;
};

export type Order = {
  id: number;
  customer_id: string;
  vendor_id: number;
  pickup_slot_id: number | null;
  status: OrderStatus;
  pickup_code: string;
  total_amount: number;
  payment_status: PaymentStatus;
  idempotency_key: string;
  rejection_reason: string | null;
  accepted_at: string | null;
  ready_at: string | null;
  collected_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type OrderItem = {
  id: number;
  order_id: number;
  name_snapshot: string;
  price_snapshot: number;
  quantity: number;
  subtotal: number;
};

export type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
  banned_at: string | null;
  banned_reason: string | null;
  banned_by: string | null;
  created_at: string;
};

export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'rejected';

export type Dispute = {
  id: number;
  order_id: number;
  raised_by_type: 'customer' | 'vendor' | 'system';
  raised_by_id: string | null;
  dispute_type: 'quality' | 'no_show' | 'payment' | 'other';
  description: string;
  status: DisputeStatus;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type Payment = {
  id: number;
  order_id: number;
  provider: 'paystack' | 'flutterwave';
  provider_reference: string;
  amount: number;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  created_at: string;
};

export type AdminAuditEntry = {
  id: number;
  admin_id: string;
  action: string;
  target_table: string;
  target_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
};

export type PlatformSetting = {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
};
