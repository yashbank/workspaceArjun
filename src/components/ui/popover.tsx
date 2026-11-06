'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';

import { cn } from '@/lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverTrigger = PopoverPrimitive.Trigger;

/** shadcn-style content: portalled (to `container`, else <body>), the same card look the old list had. */
export function PopoverContent({ className, align = 'start', sideOffset = 4, container, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content> & { container?: Element | null }) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn('z-50 rounded-lg border border-slate-200 bg-white shadow-lg outline-none', className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
