'use client';
import Link from 'next/link';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import type { StoreDashboardStats, StoreTxnRow } from '@/server/mis/store';

type Props = {
  stats: StoreDashboardStats;
  isOwner: boolean;
};

function fmt(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function fmtTime(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function StatCard({
  label,
  value,
  sub,
  color = 'slate',
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'slate' | 'amber' | 'red' | 'green' | 'blue';
  href?: string;
}) {
  const colorMap = {
    slate: 'bg-slate-50 border-slate-200 text-slate-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  const inner = (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${colorMap[color]} ${href ? 'hover:shadow-sm transition-shadow cursor-pointer' : ''}`}>
      <div className="text-xs font-medium text-current opacity-60 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs opacity-50 mt-0.5">{sub}</div>}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function StoreDashboardScreen({ stats, isOwner }: Props) {
  const hasAlerts = stats.lowStockCount > 0 || stats.outOfStockCount > 0;

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Store Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Live stock status · {stats.totalItems} items managed
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/mis/store"
            className="inline-flex min-h-11 items-center justify-center px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
          >
            All Items
          </Link>
          <Link
            href="/mis/store/transactions"
            className="inline-flex min-h-11 items-center justify-center px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
          >
            Full Log
          </Link>
          <Link
            href="/mis/store/stock"
            className="inline-flex min-h-11 items-center justify-center px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
          >
            Stock Report
          </Link>
        </div>
      </div>

      {/* Demo pricing notice */}
      {isOwner && stats.hasDemo && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <span className="mt-0.5">⚠</span>
          <span>
            Some items are using <strong>demo prices</strong>. Stock value totals are approximate.
            Edit individual items to set real prices.
          </span>
        </div>
      )}

      {/* Alert banner */}
      {hasAlerts && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <span className="mt-0.5">🚨</span>
          <span>
            {stats.outOfStockCount > 0 && (
              <span>
                <strong>{stats.outOfStockCount} item{stats.outOfStockCount !== 1 ? 's' : ''} out of stock</strong>
                {stats.lowStockCount > 0 ? ' · ' : ''}
              </span>
            )}
            {stats.lowStockCount > 0 && (
              <span>
                <strong>{stats.lowStockCount} item{stats.lowStockCount !== 1 ? 's' : ''} below reorder level</strong>
              </span>
            )}
            {' '}— <Link href="/mis/store/stock" className="underline hover:no-underline">View stock report</Link>
          </span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Items"
          value={stats.totalItems}
          href="/mis/store"
          color="slate"
        />
        <StatCard
          label="Low Stock"
          value={stats.lowStockCount}
          sub="Below reorder level"
          href="/mis/store/stock"
          color={stats.lowStockCount > 0 ? 'amber' : 'slate'}
        />
        <StatCard
          label="Today IN"
          value={stats.todayIn.toFixed(0)}
          sub="units received"
          color="green"
        />
        <StatCard
          label="Today OUT"
          value={stats.todayOut.toFixed(0)}
          sub="units issued"
          color={stats.todayOut > 0 ? 'red' : 'slate'}
        />
      </div>

      {/* Owner stock value */}
      {isOwner && stats.totalStockValue != null && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Total Stock Value</div>
          <div className="text-3xl font-bold text-blue-800 tabular-nums">
            ₹{stats.totalStockValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {stats.hasDemo && (
            <div className="text-xs text-blue-400 mt-1">* Includes demo prices — not exact</div>
          )}
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/mis/store', label: '📦 Item List', desc: 'IN / OUT movements' },
          { href: '/mis/store/stock', label: '📊 Stock Report', desc: 'Balances & value' },
          { href: '/mis/store/transactions', label: '📋 Transaction Log', desc: 'All movements' },
          { href: '/mis/store/count', label: '🔢 Physical Count', desc: 'Audit & reconcile' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all"
          >
            <div className="text-sm font-medium text-slate-800">{link.label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{link.desc}</div>
          </Link>
        ))}
      </div>

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-800">Recent Activity</h2>
          <Link
            href="/mis/store/transactions"
            className="inline-flex min-h-11 items-center text-sm text-slate-400 underline hover:text-slate-600"
          >
            View all
          </Link>
        </div>
        {stats.recentTxns.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8 border border-slate-100 rounded-xl">
            No transactions recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {stats.recentTxns.map((t: StoreTxnRow) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50">
                <div className="flex items-center gap-3 min-w-0">
                  <StatusBadge tone={t.type === 'IN' ? 'good' : 'critical'}>
                    {t.type === 'IN' ? '▲ IN' : '▼ OUT'}
                  </StatusBadge>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{t.itemName}</div>
                    <div className="text-xs text-slate-400 font-mono">{t.txnNumber}</div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <div className={`text-sm font-semibold tabular-nums ${t.type === 'IN' ? 'text-green-700' : 'text-red-600'}`}>
                    {t.type === 'IN' ? '+' : '−'}{t.quantity.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400">
                    {fmt(t.createdAt)} {fmtTime(t.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
