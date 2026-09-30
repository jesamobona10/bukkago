'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Loader2, ShieldAlert } from 'lucide-react';

import { isSupabaseConfigured } from '@/lib/supabase/env';

type Props = {
  next: string;
  notAnAdmin: boolean;
};

export default function AdminLoginForm({ next, notAnAdmin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configured = isSupabaseConfigured();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const { createSupabaseBrowserClient } = await import('@/lib/supabase/browser');
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'That email and password combination is not recognised.'
            : signInError.message
        );
        return;
      }

      // The middleware decides whether this account is actually an admin, and bounces
      // non-admins back here with ?error=not_an_admin rather than letting them in.
      window.location.href = next.startsWith('/admin') ? next : '/admin';
    } catch (cause) {
      console.error('[admin] sign-in failed', cause);
      setError('Could not reach the sign-in service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-card">
      <header>
        <div className="brand-mark">B</div>
        <h1>Super Admin Panel</h1>
        <p>Platform oversight for BukkaGo operators.</p>
      </header>

      {notAnAdmin && (
        <div className="login-error">
          <ShieldAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            That account is not a BukkaGo admin. An existing admin needs to add your user
            UUID to <code>public.admin_users</code> first.
          </span>
        </div>
      )}

      {!configured && (
        <div className="login-error">
          <ShieldAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Supabase is not configured. Copy <code>app/.env.example</code> to{' '}
            <code>app/.env.local</code> and set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </span>
        </div>
      )}

      {error && (
        <div className="login-error">
          <ShieldAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div className="login-fields">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              disabled={!configured || busy}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={!configured || busy}
            />
          </label>
        </div>

        <button type="submit" className="login-submit" disabled={!configured || busy}>
          {busy ? <Loader2 size={13} className="spin" /> : null}
          {busy ? 'Signing in\u2026' : 'Sign in'}
          {!busy ? <ArrowRight size={13} /> : null}
        </button>
      </form>

      <div className="login-foot">
        Admins are provisioned by hand, not self-served. Sign up in Supabase Auth, then
        insert your user UUID and email into <code>public.admin_users</code> with{' '}
        <code>role = &apos;super_admin&apos;</code>.
      </div>
    </div>
  );
}
