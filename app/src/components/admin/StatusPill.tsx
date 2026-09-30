import type {
  DisputeStatus,
  OrderStatus,
  PaymentStatus,
  VendorStatus,
} from '@/lib/database.types';

/**
 * Status colours already exist as `.s-*` classes for the overview's status split, so the
 * list screens reuse those rather than inventing a second palette that drifts from it.
 */
const VENDOR_TONE: Record<VendorStatus, string> = {
  pending: 's-pending',
  active: 's-active',
  suspended: 's-suspended',
  rejected: 's-rejected',
};

const VENDOR_LABEL: Record<VendorStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  suspended: 'Suspended',
  rejected: 'Rejected',
};

const ORDER_TONE: Record<OrderStatus, string> = {
  pending: 's-pending',
  accepted: 's-collected',
  rejected: 's-failed',
  preparing: 's-preparing',
  ready: 's-ready',
  collected: 's-collected',
  cancelled: 's-failed',
  no_show: 's-no_show',
};

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  unpaid: 's-unpaid',
  paid: 's-paid',
  refunded: 's-refunded',
  failed: 's-failed',
};

const DISPUTE_TONE: Record<DisputeStatus, string> = {
  open: 's-failed',
  investigating: 's-preparing',
  resolved: 's-paid',
  rejected: 's-unpaid',
};

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
}

export function StatusPill({ status }: { status: OrderStatus | PaymentStatus | string }) {
  const known =
    status in ORDER_TONE
      ? ORDER_TONE[status as OrderStatus]
      : status in PAYMENT_TONE
        ? PAYMENT_TONE[status as PaymentStatus]
        : 's-unpaid';
  return <span className={`status-pill ${known}`}>{titleCase(status)}</span>;
}

export function VendorStatusPill({ status }: { status: VendorStatus }) {
  return <span className={`status-pill ${VENDOR_TONE[status]}`}>{VENDOR_LABEL[status]}</span>;
}

export function DisputeStatusPill({ status }: { status: DisputeStatus }) {
  return <span className={`status-pill ${DISPUTE_TONE[status]}`}>{titleCase(status)}</span>;
}
