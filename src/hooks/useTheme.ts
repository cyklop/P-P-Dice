'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type ThemePreference = 'auto' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'theme';
const CYCLE: ThemePreference[] = ['auto', 'dark', 'light'];

// ---------------------------------------------------------------------------
// Tiny external store so every consumer stays in sync without context.
// ---------------------------------------------------------------------------

let listeners: Array<() => void> = [];

function subscribe(cb: () => void) {
  listeners = [...listeners, cb];
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function emitChange() {
  for (const l of listeners) l();
}

function getPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'auto';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return 'auto';
}

function getSnapshot(): ThemePreference {
  return getPreference();
}

function getServerSnapshot(): ThemePreference {
  return 'auto';
}

// ---------------------------------------------------------------------------
// Resolve: maps preference + system media query -> dark | light
// ---------------------------------------------------------------------------

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === 'auto') return getSystemTheme();
  return pref;
}

// ---------------------------------------------------------------------------
// Apply class to <html>
// ---------------------------------------------------------------------------

function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(resolved);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const resolvedTheme = resolve(theme);

  // Apply class whenever resolved theme changes.
  useEffect(() => {
    applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);

  // Listen for system preference changes (only matters when pref === 'auto').
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getPreference() === 'auto') {
        applyThemeClass(getSystemTheme());
        emitChange();
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleTheme = useCallback(() => {
    const current = getPreference();
    const idx = CYCLE.indexOf(current);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    if (next === 'auto') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
    applyThemeClass(resolve(next));
    emitChange();
  }, []);

  return { theme, resolvedTheme, toggleTheme } as const;
}
