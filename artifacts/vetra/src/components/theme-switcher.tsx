import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const themes = [
  { id: 'light', label: 'روشن' },
  { id: 'comfort', label: 'آرام' },
  { id: 'dark', label: 'تیره' },
] as const;
type Theme = (typeof themes)[number]['id'];

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('vetra-theme') as Theme) || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('vetra-theme', theme);
  }, [theme]);
  return (
    <div className="flex items-center gap-1 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1" aria-label="انتخاب پوسته">
      {themes.map((item) => (
        <Button key={item.id} type="button" size="sm" variant={item.id === theme ? 'glass' : 'ghost'} onClick={() => setTheme(item.id)}>
          {item.label}
        </Button>
      ))}
    </div>
  );
}
