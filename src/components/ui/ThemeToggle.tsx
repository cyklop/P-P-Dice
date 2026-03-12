'use client';

import { useTranslations } from 'next-intl';
import { useTheme, type ThemePreference } from '@/hooks/useTheme';

function SunIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const t = useTranslations('theme');

  const labels: Record<ThemePreference, string> = {
    auto: t('auto'),
    dark: t('dark'),
    light: t('light'),
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={labels[theme]}
      title={labels[theme]}
      className="
        group relative flex h-9 w-9 items-center justify-center
        rounded-lg border-2 border-border-fantasy
        bg-bg-card text-primary
        shadow-[0_0_8px_rgba(245,158,11,0.15)]
        transition-all duration-200
        hover:border-primary hover:shadow-[0_0_14px_rgba(245,158,11,0.3)]
        active:scale-95
        cursor-pointer
      "
    >
      <span className="relative h-4.5 w-4.5">
        <SunIcon
          className={`absolute inset-0 h-4.5 w-4.5 transition-all duration-300 ${
            theme === 'light'
              ? 'rotate-0 scale-100 opacity-100'
              : 'rotate-90 scale-0 opacity-0'
          }`}
        />
        <MoonIcon
          className={`absolute inset-0 h-4.5 w-4.5 transition-all duration-300 ${
            theme === 'dark'
              ? 'rotate-0 scale-100 opacity-100'
              : '-rotate-90 scale-0 opacity-0'
          }`}
        />
        <MonitorIcon
          className={`absolute inset-0 h-4.5 w-4.5 transition-all duration-300 ${
            theme === 'auto'
              ? 'rotate-0 scale-100 opacity-100'
              : 'rotate-90 scale-0 opacity-0'
          }`}
        />
      </span>
    </button>
  );
}
