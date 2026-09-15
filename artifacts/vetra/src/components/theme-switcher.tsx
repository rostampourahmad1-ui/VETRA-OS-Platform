import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { applyTheme, getStoredTheme, THEMES, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

const THEME_LABELS: Record<Theme, string> = {
  light: 'روشن',
  gray: 'خاکستری',
  dark: 'تیره',
};

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  useEffect(() => {
    applyTheme(document.documentElement, theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);
  return (
    <div className="flex items-center gap-1 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1" role="group" aria-label="انتخاب پوسته">
      {THEMES.map((item) => (
        <Button
          key={item}
          type="button"
          size="sm"
          variant={item === theme ? 'glass' : 'ghost'}
          onClick={() => setTheme(item)}
          aria-pressed={item === theme}
        >
          {THEME_LABELS[item]}
        </Button>
      ))}
    </div>
  );
}