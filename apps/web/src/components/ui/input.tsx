import type { ComponentProps, JSX } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>): JSX.Element {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
