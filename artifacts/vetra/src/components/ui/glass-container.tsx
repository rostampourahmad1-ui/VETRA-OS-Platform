import * as React from 'react';
import { cn } from '@/lib/utils';

export interface GlassContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: 'soft' | 'strong';
}

export const GlassContainer = React.forwardRef<HTMLDivElement, GlassContainerProps>(
  ({ className, intensity = 'soft', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border backdrop-blur-[var(--glass-blur)] transition-colors',
        intensity === 'soft' ? 'bg-[var(--glass-bg)]/70' : 'bg-[var(--glass-bg)]',
        'border-[var(--glass-border)] shadow-[var(--shadow)]',
        className,
      )}
      {...props}
    />
  ),
);
GlassContainer.displayName = 'GlassContainer';
