'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useState, useEffect, useRef } from 'react';

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

const LOCALES = [
  { code: 'de' as const, label: 'Deutsch', flag: 'DE' },
  { code: 'en' as const, label: 'English', flag: 'EN' },
];

export default function LanguageSwitcher() {
  const t = useTranslations('language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const switchLocale = (newLocale: 'de' | 'en') => {
    router.replace(pathname, { locale: newLocale });
    setOpen(false);
  };

  const current = LOCALES.find((l) => l.code === locale);

  return (
    <div ref={ref} className="fixed bottom-4 right-4 z-50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border-2 border-border-fantasy bg-bg-card px-2.5 py-1.5 text-xs font-semibold text-primary shadow-md transition-all hover:border-primary hover:shadow-lg cursor-pointer"
        aria-label={t('switch')}
        title={t('switch')}
      >
        <GlobeIcon className="h-4 w-4" />
        <span>{current?.flag ?? locale.toUpperCase()}</span>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 rounded-lg border border-border-fantasy/60 bg-bg-card shadow-xl overflow-hidden">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => switchLocale(l.code)}
              className={`flex w-full items-center gap-2 px-4 py-2 text-xs font-medium transition-colors hover:bg-primary/10 ${
                l.code === locale ? 'bg-primary/15 text-primary-light' : 'text-text'
              }`}
            >
              <span className="font-bold">{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
