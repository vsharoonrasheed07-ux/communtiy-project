'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const DEMO_USERS = [
  { role: 'Principal', email: 'principal@stayinschool.org', password: 'Password123!' },
  { role: 'Teacher (6A)', email: 'ananya@stayinschool.org', password: 'Password123!' },
  { role: 'Admin', email: 'admin@stayinschool.org', password: 'Password123!' },
  { role: 'Guardian', email: 'guardian@stayinschool.org', password: 'Password123!' },
];

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Sign in failed');
        setLoading(false);
        return;
      }

      if (data.user?.role === 'GUARDIAN') {
        router.push('/guardian');
      } else {
        router.push('/dashboard');
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-between bg-cream px-4 py-8">
      <div className="mx-auto flex w-full max-w-md justify-end">
        <LanguageSwitcher />
      </div>

      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar text-lg font-medium text-white"
            aria-hidden="true"
          >
            S
          </div>
          <div>
            <h1 className="text-xl font-medium text-ink">{t('app.name')}</h1>
            <p className="text-xs text-muted">{t('app.tagline')}</p>
          </div>
        </div>

        <div className="card p-6 sm:p-7">
          <h2 className="text-lg font-medium text-ink">{t('login.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('login.subtitle')}</p>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl bg-[#F3CDC2] px-4 py-3 text-sm font-medium text-[#8F3A2A]"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-ink">
                {t('login.email')}
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@stayinschool.org"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-ink">
                {t('login.password')}
              </label>
              <input
                id="login-password"
                type="password"
                required
                minLength={6}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? t('app.loading') : t('login.submit')}
            </button>
          </form>

          <div className="mt-6 border-t border-[#E0DDD2] pt-4">
            <p className="text-xs font-medium text-muted">{t('login.demoTitle')}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {DEMO_USERS.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                  }}
                  className="min-h-[44px] rounded-xl border border-[#E0DDD2] bg-[#FAF9F5] px-3 py-2 text-left text-xs hover:bg-[#F3F0E6]"
                >
                  <span className="block font-medium text-ink">{d.role}</span>
                  <span className="block truncate text-[11px] text-muted">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="mx-auto mt-8 max-w-md text-center text-xs text-muted">
        {t('app.privacyNote')}
      </footer>
    </div>
  );
}
