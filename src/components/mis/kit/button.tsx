'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-800 focus-visible:outline-slate-900 disabled:bg-slate-400',
  secondary:
    'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 focus-visible:outline-slate-900 disabled:text-slate-400',
  danger:
    'bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-600 disabled:bg-red-300',
  ghost:
    'text-slate-700 hover:bg-slate-100 focus-visible:outline-slate-900 disabled:text-slate-400',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  /** Stretch to the container. Primary actions on mobile usually want this. */
  block?: boolean;
  children: ReactNode;
};

/**
 * The only button in the MIS.
 *
 * Minimum height is 44px everywhere — this is used with a thumb, often a
 * gloved one, on a phone propped against a machine.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, block = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // A loading button is still focusable but must not fire twice.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed',
        block && 'w-full',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
});
