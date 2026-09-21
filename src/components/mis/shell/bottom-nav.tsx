'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

import type { NavEntry, NavIcon } from '@/server/mis/navigation';
import { cn } from '@/lib/utils';

import { useT } from './locale-provider';

/**
 * The server sends an icon NAME, not a component — a component cannot cross the
 * server/client boundary. This map turns it back into something renderable.
 */
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
 * The bottom bar: the primary way into the MIS on a phone.
 *
 * Five items at most and 44px targets, because this is used one-handed by
 * someone standing at a machine. Anchored to the bottom so it sits under the
 * thumb rather than up by the notch.
 */
export function BottomNav({ entries }: { entries: NavEntry[] }) {
  const pathname = usePathname();
  const t = useT();

  if (entries.length === 0) return null;

  return (
    <nav
      aria-label={t('app.title')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white lg:hidden"
    >
      <ul className="flex">
        {entries.map((entry) => {
          const Icon = ICONS[entry.icon];
          const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
          return (
            <li key={entry.id} className="flex-1">
              <Link
                href={entry.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs',
                  active ? 'text-slate-900' : 'text-slate-500',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="max-w-full truncate">{t(entry.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
