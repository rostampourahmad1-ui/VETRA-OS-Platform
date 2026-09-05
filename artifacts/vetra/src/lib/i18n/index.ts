import fa from './fa';
import type { FaDictionary } from './fa';

type Dict = FaDictionary;
export type TranslationKey = keyof Dict;

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key];
    return val != null ? String(val) : `{${key}}`;
  });
}

/**
 * Translate a key into Persian.
 *
 * @param key - Dot-notation key matching the dictionary (e.g. "nav.dashboard")
 * @param params - Optional interpolation values
 * @param fallback - Optional fallback string if key is missing (defaults to the key itself)
 */
export function t<K extends TranslationKey>(
  key: K,
  params?: Record<string, string | number>,
  fallback?: string,
): string {
  const value: unknown = fa[key];
  if (typeof value === 'string') {
    return interpolate(value, params);
  }
  return fallback ?? (key as string);
}

/** Helper: plural-aware translation for time strings. */
export function tCount(
  singularKey: TranslationKey,
  pluralKey: TranslationKey,
  count: number,
  params?: Record<string, string | number>,
): string {
  const key = count === 1 ? singularKey : pluralKey;
  return t(key, { ...params, count });
}

export { fa };
export type { FaDictionary };
