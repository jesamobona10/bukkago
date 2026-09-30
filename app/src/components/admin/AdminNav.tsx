'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CreditCard,
  FileWarning,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldCheck,
  Store,
  Undo2,
  Users,
} from 'lucide-react';

import type { AdminRole } from '@/lib/database.types';

type NavItem = {
  href: string;
  label: string;
  icon: typeof Store;
  /** Phase that ships this screen. Absent means it is live now. */
  phase?: number;
  superOnly?: boolean;
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Oversight',
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard },
      { href: '/admin/vendors', label: 'Vendors', icon: Store },
      { href: '/admin/orders', label: 'Orders', icon: Receipt, phase: 3 },
      { href: '/admin/customers', label: 'Customers', icon: Users, phase: 2 },
    ],
  },
  {
    group: 'Money',
    items: [
      { href: '/admin/disputes', label: 'Disputes', icon: FileWarning, phase: 3 },
      { href: '/admin/refunds', label: 'Refunds', icon: Undo2, phase: 4 },
      { href: '/admin/payments', label: 'Payments', icon: CreditCard, phase: 4 },
    ],
  },
  {
    group: 'Platform',
    items: [
      { href: '/admin/admins', label: 'Admin users', icon: ShieldCheck, phase: 5, superOnly: true },
      { href: '/admin/settings', label: 'Settings', icon: Settings, phase: 5, superOnly: true },
      { href: '/admin/audit-log', label: 'Audit log', icon: ShieldCheck, phase: 6 },
      { href: '/admin/reports', label: 'Reports', icon: BarChart3, phase: 6 },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

export default function AdminNav({ role, email }: { role: AdminRole; email: string | null }) {
  const pathname = usePathname() ?? '';

  async function signOut() {
    // Imported lazily so the nav stays usable if Supabase is not configured.
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/browser');
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/admin/login';
  }

  return (
    <aside className="admin-side">
      <div className="admin-side-brand">
        <span>B</span>
        <em>i</em>
        <i>kkaGo</i>
      </div>

      <div className="admin-tier">
        <ShieldCheck size={11} />
        Super Admin Panel
        <span>{role === 'super_admin' ? 'Super' : 'Support'}</span>
      </div>

      {NAV.map((section) => (
        <div key={section.group}>
          <div className="side-label">{section.group}</div>
          {section.items.map((item) => {
            const locked = item.superOnly && role !== 'super_admin';
            const upcoming = item.phase !== undefined;
            const classes = [
              'side-link',
              isActive(pathname, item.href) ? 'selected' : '',
              locked ? 'locked' : '',
            ]
              .filter(Boolean)
              .join(' ');

            if (upcoming || locked) {
              return (
                <div
                  key={item.href}
                  className={classes}
                  title={
                    locked
                      ? 'Only a Super Admin can reach this section.'
                      : `Arrives in Phase ${item.phase}.`
                  }
                >
                  <item.icon size={14} />
                  {item.label}
                  <b>{locked ? 'SUPER' : `P${item.phase}`}</b>
                </div>
              );
            }

            return (
              <Link key={item.href} href={item.href} className={classes}>
                <item.icon size={14} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="admin-side-foot">
        <div className="sidebar-help">
          <span>🔒</span>
          <b>Audited console</b>
          <p>
            Every action that touches money, access or account status is written to an
            append-only log with your name on it.
          </p>
        </div>
        <button type="button" className="admin-signout" onClick={signOut}>
          <Undo2 size={12} />
          {email ?? 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
