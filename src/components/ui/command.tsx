'use client';

import { Command as CommandPrimitive, useCommandState } from 'cmdk';

import { cn } from '@/lib/utils';

/**
 * Thin shadcn-style wrappers over cmdk; styling is left to the caller except the row basics.
 * There is no CommandInput on purpose: cmdk's own input forces its own id and aria-labelledby, which would break
 * the Combobox's `id` + <label htmlFor> contract, so Combobox drives a plain input inside <Command>.
 */
export const Command = CommandPrimitive;
export { useCommandState };

export function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn('max-h-64 overflow-auto', className)} {...props} />;
}

export function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn('min-h-11 cursor-pointer px-3 py-2.5 text-base text-slate-900 data-[selected=true]:bg-slate-100', className)}
      {...props}
    />
  );
}
