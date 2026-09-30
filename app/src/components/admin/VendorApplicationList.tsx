'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';

type Vendor = {
  id: number;
  name: string;
  area: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
  created_at: string;
};

type Props = {
  vendors: Vendor[];
  canAct: boolean;
};

const TONES = ['coral', 'green', 'ochre'] as const;

function toneFor(index: number) {
  return TONES[index % TONES.length];
}

function monogram(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

function formatApplied(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function VendorRow({ vendor, index, canAct }: { vendor: Vendor; index: number; canAct: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function submit() {
    if (reason.trim() === '') {
      setError('A reason is required — it is written to the audit log.');
      return;
    }
    setError(null);

    const action = open;
    const response = await fetch(`/api/admin/vendors/${vendor.id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? 'That action could not be completed.');
      return;
    }

    setOpen(null);
    setReason('');
    startTransition(() => router.refresh());
  }

  return (
    <div className="application-card">
      <div className={`application-logo ${toneFor(index)}`}>{monogram(vendor.name)}</div>

      <div className="application-details">
        <div className="application-title">
          <h3>{vendor.name}</h3>
          <span>PENDING</span>
        </div>
        <p>
          {vendor.area ?? 'Area not given'}
          <i />
          Applied {formatApplied(vendor.created_at)}
          {vendor.phone ? (
            <>
              <i />
              {vendor.phone}
            </>
          ) : null}
        </p>
        {vendor.description ? (
          <p style={{ marginBottom: 0 }}>{vendor.description}</p>
        ) : null}
      </div>

      {canAct ? (
        <div className="application-actions">
          <button
            type="button"
            className="decline-app"
            onClick={() => {
              setOpen(open === 'reject' ? null : 'reject');
              setError(null);
            }}
          >
            <X size={11} />
            Reject
          </button>
          <button
            type="button"
            className="approve-app"
            onClick={() => {
              setOpen(open === 'approve' ? null : 'approve');
              setError(null);
            }}
          >
            <Check size={11} />
            Approve
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="reason-form">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              open === 'approve'
                ? 'e.g. Verified the stall location and food handling certificate'
                : 'e.g. Menu prices unclear, applicant unresponsive on follow-up'
            }
            autoFocus
            maxLength={2000}
            disabled={pending}
          />
          <button
            type="button"
            className="approve-app"
            onClick={submit}
            disabled={pending}
          >
            {pending ? <Loader2 size={11} className="spin" /> : <Check size={11} />}
            Confirm
          </button>
          <button
            type="button"
            className="decline-app"
            onClick={() => {
              setOpen(null);
              setError(null);
            }}
            disabled={pending}
          >
            Cancel
          </button>
          <small>
            {open === 'approve'
              ? 'Sets the vendor to Active and records vendor.approve with your name and this reason.'
              : 'Sets the vendor to Rejected and records vendor.reject with your name and this reason.'}
          </small>
          {error ? (
            <p className="action-error">
              <AlertTriangle size={11} />
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function VendorApplicationList({ vendors, canAct }: Props) {
  if (vendors.length === 0) {
    return (
      <div className="admin-empty">
        <span>🗂️</span>
        <b>No pending applications</b>
        <p>Every vendor application has been decided. New ones land here automatically.</p>
      </div>
    );
  }

  return (
    <div className="application-list">
      {vendors.map((vendor, index) => (
        <VendorRow key={vendor.id} vendor={vendor} index={index} canAct={canAct} />
      ))}
    </div>
  );
}
