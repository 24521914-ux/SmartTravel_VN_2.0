import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

export type AppTheme = 'light' | 'dark';
export type AppLocale = 'vi' | 'en';

interface AppPreferencesValue {
  theme: AppTheme;
  locale: AppLocale;
  toggleTheme: () => void;
  toggleLocale: () => void;
  text: (vietnamese: string, english: string) => string;
  formatCurrency: (amount: number, currency?: string) => string;
}

const AppPreferencesContext = createContext<AppPreferencesValue | null>(null);

function storedChoice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return choices.includes(value as T) ? value as T : fallback;
  } catch { return fallback; }
}

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(() => storedChoice('smarttravel.theme', ['light', 'dark'], 'dark'));
  const [locale, setLocale] = useState<AppLocale>(() => storedChoice('smarttravel.locale', ['vi', 'en'], 'vi'));

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale;
    try { localStorage.setItem('smarttravel.theme', theme); } catch { /* Keep preference for this session. */ }
  }, [theme]);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    try { localStorage.setItem('smarttravel.locale', locale); } catch { /* Keep preference for this session. */ }
  }, [locale]);

  const value = useMemo<AppPreferencesValue>(() => ({
    theme,
    locale,
    toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark'),
    toggleLocale: () => setLocale(current => current === 'vi' ? 'en' : 'vi'),
    text: (vietnamese, english) => locale === 'vi' ? vietnamese : english,
    formatCurrency: (amount, currency = 'VND') => new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(amount),
  }), [theme, locale]);

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences() {
  const value = useContext(AppPreferencesContext);
  if (!value) throw new Error('useAppPreferences must be used within AppPreferencesProvider');
  return value;
}
