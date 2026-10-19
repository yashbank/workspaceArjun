'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { activeStoreLink, type StoreNavGroup } from '@/lib/mis/store-nav';
import { cn } from '@/lib/utils';

/**
 * R2-64 — the Store's grouped menu: Dashboard, Goods Issue, Receipts, Transactions.
 *
 * Desktop: a sticky rail to the left of the page. Phone: a collapsed "Store menu" above the page (the bottom bar
 * already carries the four everyday tabs). Groups and links come from `storeNavFor(role)`, which drops what the role
 * cannot open, so nothing here is ever greyed out.
 */
export function StoreSidebar({ groups, children }: { groups: StoreNavGroup[]; children: ReactNode }) {
  const pathname = usePathname();
  const active = activeStoreLink(groups, pathname);
  if (groups.length === 0) return <>{children}</>;

  const list = (
    <nav aria-label="Store sections" className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.id}>
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</p>
          <ul className="mt-1 flex flex-col">
            {g.links.map((l) => (
              <li key={l.id}>
                <Link
                  href={l.href}
                  aria-current={active === l.id ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center rounded-lg px-2 text-sm',
                    active === l.id ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-700 hover:bg-slate-100',
                  )}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="lg:flex lg:items-start lg:gap-6">
      <aside className="hidden w-56 shrink-0 lg:sticky lg:top-4 lg:block">{list}</aside>
      <details className="mb-3 rounded-xl border border-slate-200 bg-white lg:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-slate-800">Store menu</summary>
        <div className="border-t border-slate-100 p-2">{list}</div>
      </details>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
