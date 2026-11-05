'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Card, CardRow } from './card';
import { EmptyState } from './empty-state';
import { SkeletonList } from './skeleton';

export type Column<Row> = {
  key: string;
  /** Already translated by the caller. */
  header: string;
  render: (row: Row) => ReactNode;
  /** Hide on the mobile card to keep it to the few fields that matter. */
  hideOnMobile?: boolean;
};

export type DataTableProps<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  loading?: boolean;
  /** Already-translated empty copy. */
  emptyTitle: string;
  emptyBody?: string;
  /** Optional leading indicator, e.g. a machine's up/down dot. */
  leading?: (row: Row) => ReactNode;
  /** The list toggle (`?view=`): force cards or rows; undefined keeps the responsive default. */
  view?: 'cards' | 'rows';
};

/** A link in a cell is a 44px tap target wherever a screen puts one (T5). */
const CELL_LINKS = '[&_a]:inline-flex [&_a]:min-h-11 [&_a]:min-w-11 [&_a]:items-center';

/**
 * One set of props, two renderings: a table from `md` up, a card list below.
 *
 * Deliberately not a horizontal scroll on mobile — a supervisor holding a
 * phone one-handed will never find the column that scrolled off the right.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading = false,
  emptyTitle,
  emptyBody,
  leading,
  view,
}: DataTableProps<Row>) {
  if (loading) return <SkeletonList />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} body={emptyBody} />;

  const mobileColumns = columns.filter((c) => !c.hideOnMobile);
  const [primary, ...secondary] = mobileColumns;

  return (
    <>
      {/* Mobile: cards */}
      <div className={cn('flex flex-col gap-2', CELL_LINKS, view === 'rows' ? 'hidden' : view ? '' : 'md:hidden')}>
        {rows.map((row) => (
          <Card key={rowKey(row)} className="hover-lift" onClick={onRowClick ? () => onRowClick(row) : undefined}>
            <div className="flex items-center gap-2">
              {leading?.(row)}
              <span className="min-w-0 break-words text-base font-medium text-slate-900">
                {primary?.render(row)}
              </span>
            </div>
            <div className="mt-2">
              {secondary.map((column) => (
                <CardRow key={column.key} label={column.header} value={column.render(row)} />
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Desktop: table */}
      {/* `overflow-x-auto`: a table wider than its column (a long e-mail address, many columns) scrolls INSIDE this box.
          Without it the table pushed the whole page sideways — /mis/employees overflowed a 1440px window by 275px (F-26). */}
      <div className={cn('overflow-x-auto', CELL_LINKS, view === 'rows' ? '' : view ? 'hidden' : 'hidden md:block')}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200">
              {leading && <th className="w-8 py-2" />}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-3 py-2 text-sm font-medium text-slate-500"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-slate-100',
                  onRowClick && 'cursor-pointer hover:bg-slate-50',
                )}
              >
                {leading && <td className="py-2 pl-3">{leading(row)}</td>}
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-3 text-base text-slate-900">
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
