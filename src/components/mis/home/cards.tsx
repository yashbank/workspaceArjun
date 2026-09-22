'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { LOCALES } from '@/lib/mis/i18n';
import { cn } from '@/lib/utils';

import { useMisLocale } from '../shell/locale-provider';

/**
 * The card vocabulary every role home is built from.
 *
 * Deliberately dumb: not one of these reads the database, holds a query or
 * knows which role is looking at it. The tones are fixed by the approved design
 * (indigo = waiting on you, amber = blocker, red = failure, green = healthy,
 * white = information) and live here once, so six home screens cannot drift
 * into six slightly different ambers.
 */

const BASE = 'rounded-2xl p-4';

/**
 * The page container. One column, phone width, room at the foot for the fixed
 * bottom bar — without the pb-24 the last card sits under it and cannot be
 * tapped.
 */
export function HomeStack({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 pb-24">{children}</div>;
}

function CardShell({
  tone,
  className,
  children,
}: {
  tone: string;
  className?: string;
  children: ReactNode;
}) {
  return <section className={cn(BASE, tone, className)}>{children}</section>;
}

/** Waiting on you. The top card whenever there is one. */
export function ActionCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <CardShell tone="bg-indigo-50 border border-indigo-200" className={className}>
      {children}
    </CardShell>
  );
}

/** A blocker someone has to clear before work continues. */
export function WarnCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <CardShell tone="bg-amber-50 border border-amber-200" className={className}>
      {children}
    </CardShell>
  );
}

/** Something failed. */
export function FailCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <CardShell tone="bg-red-50 border border-red-200" className={className}>
      {children}
    </CardShell>
  );
}

/** Healthy / online. */
export function OkCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <CardShell tone="bg-green-50 border border-green-200" className={className}>
      {children}
    </CardShell>
  );
}

/** Neutral information. */
export function InfoCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <CardShell tone="bg-white border border-slate-200" className={className}>
      {children}
    </CardShell>
  );
}

/**
 * Dashed border = never recorded.
 *
 * An absence of data, which is not the same thing as a recorded zero — hence a
 * different border, not a paler fill.
 */
export function DashedCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <CardShell tone="border-2 border-dashed border-indigo-300 bg-white" className={className}>
      {children}
    </CardShell>
  );
}

/**
 * The money card. Owner only, and it says so.
 *
 * It exists on exactly one screen. Other roles do not get a greyed-out version;
 * they get nothing, because a locked box still tells you there is a box.
 */
export function MoneyCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <CardShell tone="bg-indigo-50 border border-indigo-200">
      <div className="mb-3 flex items-center justify-between gap-2">
        <SectionLabel>{title}</SectionLabel>
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
          <LockIcon />
          Visible to you only
        </span>
      </div>
      {children}
    </CardShell>
  );
}

/** The first card on every home: who you are, what time it is, language. */
export function HeaderCard({ title, meta }: { title: string; meta: string }) {
  return (
    <section className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 truncate font-mono text-xs text-slate-500">{meta}</p>
      </div>
      <LangPill />
    </section>
  );
}

/**
 * A / अ.
 *
 * Optimistic and local: the toggle flips the subtree's locale immediately. The
 * header in the shell still owns persisting the choice to the user record.
 */
function LangPill() {
  const { locale, setLocale } = useMisLocale();
  const glyphs: Record<string, string> = { en: 'A', hi: 'अ' };
  return (
    <div
      role="group"
      aria-label="Language"
      className="flex shrink-0 rounded-full border border-slate-200 bg-white p-0.5"
    >
      {LOCALES.map((option) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(option)}
            className={cn(
              // 44px hit area (24G-part1 gap 2) — was 40x40, under the tap-target rule.
              'h-11 w-11 rounded-full text-base font-semibold',
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400',
            )}
          >
            {glyphs[option] ?? option}
          </button>
        );
      })}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{children}</p>
  );
}

/** A headline number, optionally over a total ("61/70"). */
export function BigStat({
  value,
  total,
  label,
}: {
  value: number | string;
  total?: number | string;
  label?: string;
}) {
  return (
    <div>
      <p className="text-4xl font-bold leading-none text-slate-900">
        {value}
        {total !== undefined && <span className="text-lg font-bold text-slate-400">/{total}</span>}
      </p>
      {label && <p className="mt-1 text-sm text-slate-500">{label}</p>}
    </div>
  );
}

const DOT_TONES = {
  stopped: 'bg-red-500',
  risk: 'bg-amber-500',
  ok: 'bg-green-500',
  info: 'bg-indigo-500',
} as const;

export type AlertTone = keyof typeof DOT_TONES;

/**
 * One named, dated, attributable alert.
 *
 * `detail` is the whole point — "3 issues" is not an alert, "Machine 4 stopped
 * 40 minutes ago, raised by Ramesh" is.
 */
export function AlertRow({
  tone = 'info',
  title,
  detail,
  href,
}: {
  tone?: AlertTone;
  title: string;
  detail: string;
  href?: string;
}) {
  const body = (
    <div className="flex gap-2.5 py-2">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT_TONES[tone])} />
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-500">{detail}</p>
      </div>
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block rounded-xl active:bg-slate-50">
      {body}
    </Link>
  );
}

/**
 * A square count badge beside a title (R1 "Waiting on you", D1's widget) — the number that
 * is the whole reason the card exists, read before a single word.
 */
export function CountBadge({ value }: { value: number | string }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
      {value}
    </span>
  );
}

/**
 * One row inside the "Waiting on you" card: what it is, and — when it is known — how long it
 * has been waiting, as a pill on the right (R1, D1). No dot: this list is not a mix of
 * severities the way "Needs attention" is, it is one queue.
 */
export function ApprovalRow({ title, detail, age }: { title: string; detail?: string; age?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-indigo-950">{title}</p>
        {detail && <p className="truncate text-xs text-indigo-700/70">{detail}</p>}
      </div>
      {age && (
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-indigo-700">
          {age}
        </span>
      )}
    </div>
  );
}

export function PrimaryButton({
  href,
  onClick,
  className,
  icon,
  children,
}: {
  href?: string;
  onClick?: () => void;
  className?: string;
  /** e.g. the check icon on "Review approvals" (R1). Optional — most callers have none. */
  icon?: ReactNode;
  children: ReactNode;
}) {
  const classes = cn(
    'flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-center text-base font-semibold text-white hover:bg-indigo-700',
    className,
  );
  const content = (
    <>
      {icon}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  );
}

/** The quieter button that lives inside an amber card. */
export function SecondaryButton({
  href,
  onClick,
  className,
  children,
}: {
  href?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(
    'block w-full rounded-xl border border-amber-300 bg-white py-3 text-center font-semibold text-amber-900',
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

const CHIP_TONES = {
  neutral: 'bg-slate-100 text-slate-600',
  risk: 'bg-amber-100 text-amber-800',
  bad: 'bg-red-100 text-red-700',
  ok: 'bg-green-100 text-green-700',
  action: 'bg-indigo-100 text-indigo-700',
} as const;

export function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof CHIP_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        CHIP_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Order numbers, GRN numbers, employee codes. */
export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs text-slate-500">{children}</span>;
}

/** Said out loud when a card has nothing to show, instead of a confident zero. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

const STAT_TONES = {
  ok: 'border-green-200 bg-green-50 text-green-700',
  risk: 'border-amber-200 bg-amber-50 text-amber-800',
  bad: 'border-red-200 bg-red-50 text-red-700',
  neutral: 'border-slate-200 bg-white text-slate-900',
} as const;

export type StatTrioItem = {
  value: number | string;
  label: string;
  tone?: keyof typeof STAT_TONES;
  href?: string;
};

/** Numbers side by side — machines free/running/down, yesterday's totals. */
export function StatTrio({ items }: { items: StatTrioItem[] }) {
  return (
    <div className={cn('grid gap-2', items.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {items.map((item) => {
        const inner = (
          <>
            <span className="text-2xl font-bold leading-none">{item.value}</span>
            <span className="mt-1 block text-[11px] font-medium opacity-80">{item.label}</span>
          </>
        );
        const classes = cn(
          'block rounded-xl border p-3 text-center',
          STAT_TONES[item.tone ?? 'neutral'],
        );
        return item.href ? (
          <Link key={item.label} href={item.href} className={classes}>
            {inner}
          </Link>
        ) : (
          <div key={item.label} className={classes}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/** A tappable icon + word, for the admin shortcut row. */
export function ShortcutTile({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        {icon}
      </span>
      <span className="text-xs font-semibold leading-tight text-slate-700">{label}</span>
    </Link>
  );
}

/** A list row that goes somewhere. Title on the left, whatever you pass on the right. */
export function RowLink({
  href,
  title,
  detail,
  right,
}: {
  href: string;
  title: ReactNode;
  detail?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="-mx-1 flex items-center justify-between gap-3 rounded-xl px-1 py-2.5 active:bg-slate-50"
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-slate-900">{title}</span>
        {detail && <span className="block truncate text-sm text-slate-500">{detail}</span>}
      </span>
      {right && <span className="shrink-0">{right}</span>}
    </Link>
  );
}

/** Hairline between rows inside one card. */
export function Divider() {
  return <div className="my-1 h-px bg-slate-200/70" />;
}

/** The check on "Review approvals" (R1) — an icon repeated wherever a button confirms a review/approve action. */
export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? 'h-4 w-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
