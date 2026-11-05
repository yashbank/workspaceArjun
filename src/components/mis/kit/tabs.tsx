'use client';

import { cn } from '@/lib/utils';

export type TabItem = { id: string; label: string };

/** Underline tab strip, 44px targets, scrolls sideways on a phone. The caller renders the panel (role=tabpanel, aria-labelledby=`tab-<id>`). */
export function Tabs({ tabs, active, onChange, label }: { tabs: TabItem[]; active: string; onChange: (id: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          role="tab"
          type="button"
          aria-selected={t.id === active}
          onClick={() => onChange(t.id)}
          className={cn(
            'min-h-11 shrink-0 border-b-2 px-4 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-600',
            t.id === active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
