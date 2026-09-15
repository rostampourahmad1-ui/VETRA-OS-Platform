export const THEMES = ['light', 'gray', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = 'vetra-theme';
export const DEFAULT_THEME: Theme = 'light';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  // Legacy migration: comfort → gray
  if (stored === 'comfort') return 'gray';
  return isTheme(stored) ? stored : DEFAULT_THEME;
}

/**
 * Apply a theme to the document root.
 *
 * The app uses two complementary token systems:
 * - `data-theme` switches the glass/design tokens in `styles/themes.css`
 * - the `.dark` class switches the shadcn/Tailwind HSL tokens in `index.css`
 * Both must be applied together so a dark theme also restyles cards, tables,
 * inputs, and popovers instead of leaving them in light colors.
 */
export function applyTheme(root: HTMLElement, theme: Theme): void {
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}