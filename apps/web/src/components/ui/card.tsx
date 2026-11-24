import type { ComponentProps, JSX } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return <div data-slot="card" className={cn('flex flex-col gap-4 rounded-xl border bg-card py-5 text-card-foreground shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return <div data-slot="card-header" className={cn('flex items-center justify-between gap-2 px-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>): JSX.Element {
  return <h2 data-slot="card-title" className={cn('font-semibold leading-none', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>): JSX.Element {
  return <div data-slot="card-content" className={cn('px-5', className)} {...props} />;
}
