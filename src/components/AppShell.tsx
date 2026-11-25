'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LogOut,
  Menu,
  X,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { getQueuedAttendance, syncQueuedAttendance } from '@/lib/offline-queue';

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: 'TEACHER' | 'PRINCIPAL' | 'ADMIN' | 'GUARDIAN';
}

export interface NavCounts {
  students: number;
  atRisk: number;
  openCases: number;
  unreadNotifications: number;
}

interface NavItem {
  href: string;
  labelKey: string;
  squareColor: string;
  badgeKey?: keyof NavCounts;
  roles: Array<ShellUser['role']>;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    labelKey: 'dashboard',
    squareColor: '#CFE6DC',
    roles: ['TEACHER', 'PRINCIPAL', 'ADMIN'],
  },
  {
    href: '/students',
    labelKey: 'students',
    squareColor: '#CBDDF0',
    badgeKey: 'students',
    roles: ['TEACHER', 'PRINCIPAL', 'ADMIN'],
  },
  {
    href: '/attendance',
    labelKey: 'attendance',
    squareColor: '#F3DFAE',
    roles: ['TEACHER', 'PRINCIPAL', 'ADMIN'],
  },
  {
    href: '/at-risk',
    labelKey: 'atRisk',
    squareColor: '#F3CDC2',
    badgeKey: 'atRisk',
    roles: ['TEACHER', 'PRINCIPAL', 'ADMIN'],
  },
  {
    href: '/cases',
    labelKey: 'cases',
    squareColor: '#E8B8A8',
    badgeKey: 'openCases',
    roles: ['TEACHER', 'PRINCIPAL', 'ADMIN'],
  },
  {
    href: '/re-enrolment',
    labelKey: 'reEnrolment',
    squareColor: '#B8DEC9',
    roles: ['TEACHER', 'PRINCIPAL', 'ADMIN'],
  },
  {
    href: '/reports',
    labelKey: 'reports',
    squareColor: '#D6E4F0',
    roles: ['TEACHER', 'PRINCIPAL', 'ADMIN'],
  },
  {
    href: '/schemes',
    labelKey: 'schemes',
    squareColor: '#EFE3BE',
    roles: ['TEACHER', 'PRINCIPAL', 'ADMIN'],
  },
  {
    href: '/settings',
    labelKey: 'settings',
    squareColor: '#D9DCD6',
    roles: ['ADMIN'],
  },
  {
    href: '/audit-log',
    labelKey: 'auditLog',
    squareColor: '#C9D6D2',
    roles: ['ADMIN'],
  },
  {
    href: '/guardian',
    labelKey: 'guardianPortal',
    squareColor: '#CFE6DC',
    roles: ['GUARDIAN', 'ADMIN'],
  },
];

export function AppShell({
  user,
  counts: initialCounts,
  children,
}: {
  user: ShellUser;
  counts?: NavCounts;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();

  const [counts, setCounts] = useState<NavCounts>(
    initialCounts ?? { students: 0, atRisk: 0, openCases: 0, unreadNotifications: 0 }
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const mobileBottomItems = visibleItems.slice(0, 4);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    async function refreshQueueAndSync() {
      const queued = await getQueuedAttendance();
      setQueuedCount(queued.length);
      if (navigator.onLine && queued.length > 0) {
        setSyncing(true);
        const res = await syncQueuedAttendance();
        setSyncing(false);
        const remaining = await getQueuedAttendance();
        setQueuedCount(remaining.length);
        if (res.syncedCount > 0) {
          router.refresh();
        }
      }
    }

    const updateOnlineStatus = () => {
      setIsOffline(!navigator.onLine);
      if (navigator.onLine) {
        refreshQueueAndSync();
      }
    };

    setIsOffline(!navigator.onLine);
    refreshQueueAndSync();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [router]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.counts) setCounts(data.counts);
      })
      .catch(() => undefined);
  }, [pathname]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-cream text-ink md:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:bg-sidebar md:text-[#F5F3EC]">
        <div className="border-b border-[#245950] px-5 py-5">
          <Link href={user.role === 'GUARDIAN' ? '/guardian' : '/dashboard'} className="block">
            <span className="text-lg font-medium tracking-tight text-white">
              {t('app.name')}
            </span>
            <span className="mt-0.5 block text-xs text-[#BFD3CE]">{user.role}</span>
          </Link>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
            const badgeValue = item.badgeKey ? counts[item.badgeKey] : undefined;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#225C53] text-white'
                    : 'text-[#DCE7E4] hover:bg-sidebar-hover hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: item.squareColor }}
                    aria-hidden="true"
                  />
                  <span>{t(`nav.${item.labelKey}`)}</span>
                </span>
                {badgeValue !== undefined && badgeValue > 0 && (
                  <span className="rounded-full bg-[#2B6E63] px-2 py-0.5 text-xs font-medium text-[#F5F3EC]">
                    {badgeValue}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-[#245950] p-4">
          <LanguageSwitcher compact />
          <div className="text-xs text-[#BFD3CE]">
            <p className="truncate font-medium text-white">{user.name}</p>
            <p className="truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-[#2C6B60] px-3 text-sm font-medium text-[#F5F3EC] hover:bg-sidebar-hover"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>{t('app.signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-h-screen flex-1 flex-col pb-20 md:pb-0">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 text-white md:hidden">
          <Link
            href={user.role === 'GUARDIAN' ? '/guardian' : '/dashboard'}
            className="text-base font-medium"
          >
            {t('app.name')}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <button
              type="button"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-sidebar-hover"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </header>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="border-b border-[#245950] bg-sidebar px-3 py-3 text-[#F5F3EC] md:hidden">
            <nav aria-label="Mobile menu" className="grid grid-cols-2 gap-1.5">
              {visibleItems.map((item) => {
                const active = pathname === item.href;
                const badgeValue = item.badgeKey ? counts[item.badgeKey] : undefined;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2 text-sm font-medium ${
                      active ? 'bg-[#225C53] text-white' : 'text-[#DCE7E4]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: item.squareColor }}
                      />
                      <span className="truncate">{t(`nav.${item.labelKey}`)}</span>
                    </span>
                    {badgeValue !== undefined && badgeValue > 0 && (
                      <span className="ml-1 rounded-full bg-[#2B6E63] px-1.5 py-0.5 text-[11px]">
                        {badgeValue}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 flex items-center justify-between border-t border-[#245950] pt-3">
              <div className="text-xs text-[#BFD3CE]">
                <p className="font-medium text-white">{user.name}</p>
                <p>{user.role}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[#2C6B60] px-3 text-xs font-medium text-white"
              >
                <LogOut className="h-4 w-4" />
                <span>{t('app.signOut')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Offline / Sync Indicator Banner */}
        {(isOffline || queuedCount > 0 || syncing) && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-3 border-b border-[#E5C98E] bg-[#F3DFAE] px-4 py-2.5 text-sm font-medium text-[#7A4F00]"
          >
            <span className="flex items-center gap-2">
              {syncing ? (
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <WifiOff className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {syncing
                  ? t('app.syncingIndicator')
                  : `${t('app.offlineIndicator')}${queuedCount > 0 ? ` (${queuedCount} queued)` : ''}`}
              </span>
            </span>
          </div>
        )}

        <main className="flex-1 px-4 py-5 md:px-8 md:py-7">{children}</main>

        {/* Privacy Footer */}
        <footer className="border-t border-[#E0DDD2] bg-[#EAE6D8] px-4 py-3 text-xs text-[#4B5753] md:px-8">
          {t('app.privacyNote')}
        </footer>
      </div>

      {/* Mobile Bottom Bar */}
      <nav
        aria-label="Quick mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-[#245950] bg-sidebar px-1 py-1 text-[#DCE7E4] md:hidden"
      >
        {mobileBottomItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium ${
                active ? 'bg-[#225C53] text-white' : 'text-[#DCE7E4]'
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{ backgroundColor: item.squareColor }}
                aria-hidden="true"
              />
              <span className="truncate">{t(`nav.${item.labelKey}`)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
