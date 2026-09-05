/**
 * VETRA LocaleContext
 *
 * Provides locale direction and language info throughout the component tree.
 * Currently only Persian (fa) is supported; this foundation makes future
 * multi-locale work (en, ar, etc.) straightforward.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type Locale = 'fa';
export type Direction = 'rtl' | 'ltr';

interface LocaleContextValue {
  /** Current locale code */
  locale: Locale;
  /** Writing direction for the current locale */
  direction: Direction;
  /** Short label for current locale */
  label: string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const LOCALE_MAP: Record<Locale, { direction: Direction; label: string }> = {
  fa: { direction: 'rtl', label: 'فارسی' },
};

/**
 * Provides locale context to the app tree.
 * Currently hard-coded to Persian; extend by accepting a locale prop.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale: 'fa',
      direction: 'rtl',
      label: 'فارسی',
    }),
    [],
  );

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

/**
 * Hook to access the current locale context.
 * Throws if used outside LocaleProvider.
 */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return ctx;
}
