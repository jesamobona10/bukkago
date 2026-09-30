'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';

/**
 * Every Phase 2/3/5/6 write goes through one of the audited SECURITY DEFINER functions, and
 * each needs the same three things: an explicit confirmation step, a reason that lands in the
 * audit log, and a readable error if the database refuses. This is the single implementation of
 * that pattern; the alternative is a dozen near-identical components that drift apart.
 */

export type ActionField =
  | {
      kind: 'text' | 'number';
      name: string;
      label: string;
      placeholder?: string;
      required?: boolean;
      defaultValue?: string;
    }
  | {
      kind: 'textarea';
      name: string;
      label: string;
      placeholder?: string;
      required?: boolean;
      defaultValue?: string;
    }
  | {
      kind: 'select';
      name: string;
      label: string;
      options: { value: string; label: string }[];
      required?: boolean;
      defaultValue?: string;
    }
  | {
      /** Free-form JSON, used by the platform settings editor. Validated before submit. */
      kind: 'json';
      name: string;
      label: string;
      placeholder?: string;
      required?: boolean;
      defaultValue?: string;
    };

type Props = {
  /** Route handler that calls runAuditedAction, e.g. /api/admin/vendors/3/suspend. */
  endpoint: string;
  /** Fields the route already knows from the URL, e.g. { p_vendor_id: 3 }. */
  args?: Record<string, unknown>;
  /** Extra form fields, merged with the reason before POST. */
  fields?: ActionField[];
  actionLabel: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  /** Every audited function except admin_provision_vendor's optional reason needs one. */
  requiresReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  multilineReason?: boolean;
  /** Reassurance shown under the form, e.g. what the action actually changes. */
  help?: string;
  /** Disabled for viewers who cannot act; renders a plain note instead of a button. */
  disabled?: boolean;
  disabledReason?: string;
};

export default function AuditedAction({
  endpoint,
  args,
  fields = [],
  actionLabel,
  confirmLabel = 'Confirm',
  tone = 'danger',
  requiresReason = true,
  reasonLabel = 'Reason (recorded in the audit log)',
  reasonPlaceholder,
  multilineReason = false,
  help,
  disabled = false,
  disabledReason,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? '']))
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (disabled) {
    return disabledReason ? <p className="action-disabled">{disabledReason}</p> : null;
  }

  function close() {
    setOpen(false);
    setError(null);
    setReason('');
    setValues(Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? ''])));
  }

  async function submit() {
    setError(null);

    if (requiresReason && reason.trim() === '') {
      setError('A reason is required — it is written to the audit log.');
      return;
    }

    const body: Record<string, unknown> = { ...args };

    for (const field of fields) {
      const value = values[field.name]?.trim() ?? '';
      if (field.required && value === '') {
        setError(`${field.label} is required.`);
        return;
      }
      if (value === '') continue;

      if (field.kind === 'json') {
        try {
          body[field.name] = JSON.parse(value);
        } catch {
          setError(`${field.label} must be valid JSON.`);
          return;
        }
        continue;
      }
      if (field.kind === 'number') {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          setError(`${field.label} must be a number.`);
          return;
        }
        body[field.name] = parsed;
        continue;
      }

      body[field.name] = value;
    }

    if (requiresReason) body.reason = reason.trim();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      setError(payload.error ?? 'That action could not be completed.');
      return;
    }

    setNotice(payload.message ?? null);
    close();
    startTransition(() => router.refresh());
  }

  const triggerClass = tone === 'danger' ? 'decline-app' : 'approve-app';
  const confirmClass = tone === 'danger' ? 'decline-app' : 'approve-app';

  return (
    <div className="audited-action">
      {notice ? (
        <p className="action-notice">
          <Check size={11} />
          {notice}
        </p>
      ) : null}

      {open ? (
        <div className="reason-form">
          {fields.map((field) => (
            <label key={field.name} className="action-field">
              <span>
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {field.kind === 'select' ? (
                <select
                  value={values[field.name] ?? ''}
                  onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                  disabled={pending}
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.kind === 'textarea' || field.kind === 'json' ? (
                <textarea
                  value={values[field.name] ?? ''}
                  onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                  placeholder={field.placeholder}
                  rows={field.kind === 'json' ? 4 : 3}
                  spellCheck={field.kind !== 'json'}
                  disabled={pending}
                />
              ) : (
                <input
                  type={field.kind === 'number' ? 'number' : 'text'}
                  value={values[field.name] ?? ''}
                  onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                  placeholder={field.placeholder}
                  disabled={pending}
                />
              )}
            </label>
          ))}

          {requiresReason ? (
            <label className="action-field">
              <span>{reasonLabel} *</span>
              {multilineReason ? (
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={reasonPlaceholder}
                  rows={3}
                  maxLength={2000}
                  autoFocus
                  disabled={pending}
                />
              ) : (
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={reasonPlaceholder}
                  maxLength={2000}
                  autoFocus
                  disabled={pending}
                />
              )}
            </label>
          ) : null}

          <div className="action-buttons">
            <button
              type="button"
              className={confirmClass}
              onClick={submit}
              disabled={pending}
            >
              {pending ? (
                <Loader2 size={11} className="spin" />
              ) : (
                <Check size={11} />
              )}
              {confirmLabel}
            </button>
            <button type="button" className="decline-app" onClick={close} disabled={pending}>
              <X size={11} />
              Cancel
            </button>
          </div>

          {help ? <small>{help}</small> : null}
          {error ? (
            <p className="action-error">
              <AlertTriangle size={11} />
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className={triggerClass}
          onClick={() => {
            setOpen(true);
            setError(null);
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
