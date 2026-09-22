'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  // MIS_UI_SPEC §4.3: "Primary button: ... bg-indigo-600 ... hover:bg-indigo-700" — this was
  // `bg-slate-900` (near-black), the one primary action in the MIS that did not read as
  // indigo (flagged cross-part, 24G-part2 G2-11 → Part 1). Every other primary surface in the
  // app (home cards' PrimaryButton, the desktop shell's active nav item, D1/D2's Customise
  // bar) already uses indigo-600; this brings the shared kit Button in line with them.
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-indigo-600 disabled:bg-indigo-300',
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
