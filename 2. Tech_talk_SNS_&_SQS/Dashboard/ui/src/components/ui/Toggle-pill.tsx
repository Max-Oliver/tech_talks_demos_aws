'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type ToggleGroupProps<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  ariaLabel?: string;
};

export function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: ToggleGroupProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {options.map((opt) => (
        <TogglePill
          // clave y estado seleccionado
          key={opt.value}
          pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </TogglePill>
      ))}
    </div>
  );
}

type TogglePillProps = {
  pressed?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
};

export function TogglePill({ pressed, onClick, children, className }: TogglePillProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={!!pressed}
      onClick={onClick}
      className={cn(
        'h-9 px-3 rounded-full border text-sm transition focus:outline-none',
        // base
        'border-slate-600/60 bg-slate-900/60 text-slate-200',
        'hover:bg-slate-800',
        // foco accesible
        'focus-visible:ring-2 focus-visible:ring-indigo-500/40',
        // estado seleccionado
        pressed &&
          'border-indigo-500/60 text-indigo-100 bg-indigo-600/20 shadow-[0_0_0_1px_rgba(99,102,241,.35)_inset]',
        className
      )}
    >
      {children}
    </button>
  );
}
