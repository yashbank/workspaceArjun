'use client';

import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

const BASE =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent';
const DANGER = 'text-red-600 hover:bg-red-50 hover:text-red-700';

type Common = {
  /** Required: it is the accessible name AND the hover tooltip, so an icon is never mute. */
  label: string;
  icon: ReactNode;
  danger?: boolean;
  className?: string;
};

type ButtonProps = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'title'> & { href?: undefined };
type LinkProps = Common & { href: string; onClick?: undefined; disabled?: undefined };

/**
 * A compact row action (view / edit / delete ...) for list tables: one 44px icon with a tooltip
 * (R2-392). The name is always the text a screen reader hears, so swapping a "View" text button for
 * this never removes the label from the accessibility tree.
 */
export const IconAction = forwardRef<HTMLButtonElement, ButtonProps | LinkProps>(function IconAction(props, ref) {
  const { label, icon, danger, className } = props;
  const cls = cn(BASE, danger && DANGER, className);
  if (typeof props.href === 'string') {
    return (
      <Link href={props.href} aria-label={label} title={label} className={cls}>
        {icon}
      </Link>
    );
  }
  const { label: _l, icon: _i, danger: _d, className: _c, href: _h, ...rest } = props as ButtonProps;
  return (
    <button ref={ref} type="button" aria-label={label} title={label} className={cls} {...rest}>
      {icon}
    </button>
  );
});
