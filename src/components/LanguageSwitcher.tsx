'use client';

import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
] as const;

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(nextLocale: string) {
    setSaving(true);
    try {
      // Set cookie client-side immediately
      document.cookie = `locale=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
      
      // Also notify API
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: nextLocale }),
      }).catch(() => undefined);

      // Force full window reload so server components and RootLayout re-evaluate the cookie
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="inline-flex min-h-[44px] items-center gap-2 text-xs">
      <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">Select language</span>
      <select
        aria-label="Language"
        disabled={saving}
        value={locale}
        onChange={(e) => handleChange(e.target.value)}
        className={`min-h-[36px] rounded-lg border px-2 py-1 text-xs font-medium ${
          compact
            ? 'border-[#33665C] bg-[#1E544B] text-[#F5F3EC]'
            : 'border-[#D4D0C5] bg-white text-[#1A2421]'
        }`}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="bg-white text-[#1A2421]">
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
