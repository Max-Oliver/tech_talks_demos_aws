// components/ui/slider.tsx
'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

export interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  trackClassName?: string;
  rangeClassName?: string;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, trackClassName, rangeClassName, ...props }, ref) => {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn('relative flex w-full select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          'relative h-2 w-full grow overflow-hidden rounded-full bg-slate-800/70',
          trackClassName
        )}
      >
        <SliderPrimitive.Range
          className={cn(
            'absolute h-full',
            // 🎨 gradiente por defecto
            'bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500',
            rangeClassName
          )}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          'block h-5 w-5 rounded-full border-2 border-indigo-500',
          'bg-slate-950 shadow focus:outline-none focus:ring-2 focus:ring-indigo-500/40'
        )}
      />
    </SliderPrimitive.Root>
  );
});
Slider.displayName = 'Slider';

export { Slider };
