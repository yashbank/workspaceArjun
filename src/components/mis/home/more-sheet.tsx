'use client';

import Link from 'next/link';
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Database,
  Factory,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import { groupMoreNav, moreGroupLabelKey } from '@/lib/mis/phone-more';
import type { NavEntry, NavIcon } from '@/server/mis/navigation';
import { cn } from '@/lib/utils';

import { SlideOver } from '../kit/slide-over';
import { useT } from '../shell/locale-provider';

/** The server sends an icon NAME; a component cannot cross the server/client boundary. */
const ICONS: Record<NavIcon, LucideIcon> = {
  database: Database,
  clipboard: ClipboardList,
  factory: Factory,
  check: CheckCircle2,
  users: Users,
  chart: BarChart3,
  settings: Settings,
  wrench: Wrench,
};

/**
 * The phone "More" sheet (D32): every screen the role may open, as links, in sections.
 *
 * It renders exactly the entries it is given. The server derived them from the same permission
 * table as the desktop sidebar, so nothing here can offer a screen the role cannot open, or hide
 * one it can. The dialog is the kit's `SlideOver` in its bottom placement: Escape, a backdrop tap
 * and the close button all end at `onClose`, and the parent also closes it on a route change.
 */
export function MoreSheet({
  open,
  entries,
  pathname,
  onClose,
}: {
  open: boolean;
  entries: readonly NavEntry[];
  pathname: string;
  onClose: () => void;
}) {
  const t = useT();
  const groups = groupMoreNav(entries);

  return (
    <SlideOver open={open} title={t('more.title')} onClose={onClose} placement="bottom">
      <div className="flex flex-col gap-4 pb-2">
        {groups.map(({ group, entries: rows }) => (
          <section key={group} aria-label={t(moreGroupLabelKey(group))}>
            <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t(moreGroupLabelKey(group))}
            </h3>
            <ul>
              {rows.map((entry) => {
                const Icon = ICONS[entry.icon];
                const current = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
                return (
                  <li key={entry.id}>
                    <Link
                      href={entry.href}
                      onClick={onClose}
                      aria-current={current ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 items-center gap-3 rounded-lg px-3 text-base',
                        current
                          ? 'bg-indigo-50 font-semibold text-indigo-700'
                          : 'text-slate-900 hover:bg-slate-100',
                      )}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 truncate">{t(entry.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </SlideOver>
  );
}
