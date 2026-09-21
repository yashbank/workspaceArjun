'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';

type ProductionData = { rows: { orderNumber: string; description: string | null; produced: number; waste: number; entries: number }[]; raw: any[] };
type AttendanceData = { rows: { name: string; code: string; dept: string; present: number; absent: number; late: number; ot: number }[]; raw: any[] };
type QcData = { rows: { orderNumber: string; pass: number; fail: number; na: number }[]; raw: any[] };
type StoreItemRow = { id: string; name: string; code: string; unit: string; pricePerUnit?: number | null; totalIn: number; totalOut: number; txnCount: number };
type StoreData = { rows: StoreItemRow[]; raw: any[] };

type Tab = 'production' | 'attendance' | 'qc' | 'orders' | 'store';

type Props = {
  production: ProductionData;
  attendance: AttendanceData;
  qc: QcData;
  orders: any[];
  store: StoreData;
  canSeeWages: boolean;
  isOwner: boolean;
  rangeLabel: string;
  year: number;
  month: number;
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function statusTone(s: string): BadgeTone {
  switch (s) {
    case 'CONFIRMED': return 'info';
    case 'IN_PRODUCTION': return 'warning';
    case 'COMPLETE': return 'good';
    case 'CANCELLED': return 'critical';
    default: return 'neutral';
  }
}

function downloadCsv(filename: string, rows: string[][], headers: string[]) {
  const lines = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function ReportsScreen({ production, attendance, qc, orders, store, canSeeWages, isOwner, rangeLabel, year, month }: Props) {
  const [tab, setTab] = useState<Tab>('production');
  const router = useRouter();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'production', label: 'Production' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'qc', label: 'Quality' },
    { key: 'orders', label: 'Orders' },
    { key: 'store', label: 'Store' },
  ];

  function nav(newYear: number, newMonth: number) {
    router.push(`/mis/reports?year=${newYear}&month=${newMonth}`);
  }

  function prevMonth() {
    if (month === 1) nav(year - 1, 12);
    else nav(year, month - 1);
  }

  function nextMonth() {
    if (month === 12) nav(year + 1, 1);
    else nav(year, month + 1);
  }

  const prodCols: Column<(typeof production.rows)[0]>[] = [
    { key: 'orderNumber', header: 'Order', render: r => <span className="font-mono text-sm">{r.orderNumber}</span> },
    { key: 'description', header: 'Description', render: r => r.description ?? '—' },
    { key: 'produced', header: 'Produced', render: r => <span className="font-medium">{r.produced.toLocaleString('en-IN')} kg</span> },
    { key: 'waste', header: 'Waste', render: r => `${r.waste.toLocaleString('en-IN')} kg` },
    { key: 'entries', header: 'Log Entries', render: r => r.entries.toString() },
    { key: 'yield', header: 'Yield %', render: r => {
      if (!r.produced) return '—';
      return `${(((r.produced - r.waste) / r.produced) * 100).toFixed(1)}%`;
    }},
  ];

  const attCols: Column<(typeof attendance.rows)[0]>[] = [
    { key: 'name', header: 'Employee', render: r => r.name },
    { key: 'code', header: 'Code', render: r => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'dept', header: 'Department', render: r => r.dept },
    { key: 'present', header: 'Present', render: r => <span className="text-green-600 font-medium">{r.present}</span> },
    { key: 'absent', header: 'Absent', render: r => <span className={r.absent > 0 ? 'text-red-600 font-medium' : ''}>{r.absent}</span> },
    { key: 'late', header: 'Late', render: r => r.late.toString() },
    { key: 'ot', header: 'OT Days', render: r => r.ot.toString() },
  ];

  const qcCols: Column<(typeof qc.rows)[0]>[] = [
    { key: 'orderNumber', header: 'Order', render: r => <span className="font-mono text-sm">{r.orderNumber}</span> },
    { key: 'pass', header: 'PASS', render: r => <span className="text-green-600 font-medium">{r.pass}</span> },
    { key: 'fail', header: 'FAIL', render: r => <span className={r.fail > 0 ? 'text-red-600 font-medium' : ''}>{r.fail}</span> },
    { key: 'na', header: 'N/A', render: r => r.na.toString() },
    { key: 'rate', header: 'Pass Rate', render: r => {
      const total = r.pass + r.fail;
      if (!total) return '—';
      return `${((r.pass / total) * 100).toFixed(0)}%`;
    }},
  ];

  const orderCols: Column<any>[] = [
    { key: 'orderNumber', header: 'Order #', render: r => <span className="font-mono text-sm">{r.orderNumber}</span> },
    { key: 'customer', header: 'Customer', render: r => r.customer?.name ?? '—' },
    { key: 'description', header: 'Description', render: r => r.description ?? '—' },
    { key: 'status', header: 'Status', render: r => <StatusBadge tone={statusTone(r.status)}>{r.status.replace(/_/g,' ')}</StatusBadge> },
    { key: 'deliveryDate', header: 'Delivery', render: r => r.deliveryDate ? new Date(r.deliveryDate).toLocaleDateString('en-IN') : '—' },
  ];

  const totProd = production.rows.reduce((s, r) => s + r.produced, 0);
  const totWaste = production.rows.reduce((s, r) => s + r.waste, 0);
  const totPresent = attendance.rows.reduce((s, r) => s + r.present, 0);
  const totAbsent = attendance.rows.reduce((s, r) => s + r.absent, 0);
  const totQcPass = qc.rows.reduce((s, r) => s + r.pass, 0);
  const totQcFail = qc.rows.reduce((s, r) => s + r.fail, 0);
  const totStoreIn = store.rows.reduce((s, r) => s + r.totalIn, 0);
  const totStoreOut = store.rows.reduce((s, r) => s + r.totalOut, 0);
  const totStoreValue = isOwner ? store.rows.reduce((s, r) => s + (r.pricePerUnit ?? 0) * r.totalIn, 0) : null;

  const storeCols: Column<StoreItemRow>[] = [
    { key: 'name', header: 'Item', render: r => <span className="font-medium">{r.name}</span> },
    { key: 'code', header: 'Code', render: r => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'unit', header: 'Unit', render: r => r.unit || '—' },
    { key: 'totalIn', header: 'IN Qty', render: r => <span className="text-green-600 font-medium">{r.totalIn.toLocaleString('en-IN')}</span> },
    { key: 'totalOut', header: 'OUT Qty', render: r => <span className="text-amber-600 font-medium">{r.totalOut.toLocaleString('en-IN')}</span> },
    { key: 'txnCount', header: 'Txns', render: r => r.txnCount.toString() },
    ...(isOwner ? [{
      key: 'value' as const,
      header: 'IN Value (₹)',
      render: (r: StoreItemRow) => r.pricePerUnit != null
        ? `₹${(r.pricePerUnit * r.totalIn).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        : '—',
    }] : []),
  ];

  function handleExport() {
    const filename = `report-${year}-${String(month).padStart(2, '0')}-${tab}.csv`;
    if (tab === 'production') {
      const headers = ['Order', 'Description', 'Produced (kg)', 'Waste (kg)', 'Log Entries', 'Yield %'];
      const rows = production.rows.map(r => [
        r.orderNumber, r.description ?? '', String(r.produced), String(r.waste), String(r.entries),
        r.produced ? (((r.produced - r.waste) / r.produced) * 100).toFixed(1) : '0',
      ]);
      downloadCsv(filename, rows, headers);
    } else if (tab === 'attendance') {
      const headers = ['Employee', 'Code', 'Department', 'Present', 'Absent', 'Late', 'OT Days'];
      const rows = attendance.rows.map(r => [r.name, r.code, r.dept, String(r.present), String(r.absent), String(r.late), String(r.ot)]);
      downloadCsv(filename, rows, headers);
    } else if (tab === 'qc') {
      const headers = ['Order', 'PASS', 'FAIL', 'N/A', 'Pass Rate %'];
      const rows = qc.rows.map(r => {
        const total = r.pass + r.fail;
        return [r.orderNumber, String(r.pass), String(r.fail), String(r.na), total ? ((r.pass / total) * 100).toFixed(0) : '0'];
      });
      downloadCsv(filename, rows, headers);
    } else if (tab === 'store') {
      const headers = isOwner
        ? ['Item', 'Code', 'Unit', 'IN Qty', 'OUT Qty', 'Txns', 'IN Value (₹)']
        : ['Item', 'Code', 'Unit', 'IN Qty', 'OUT Qty', 'Txns'];
      const rows = store.rows.map(r => {
        const base = [r.name, r.code, r.unit, String(r.totalIn), String(r.totalOut), String(r.txnCount)];
        if (isOwner) base.push(r.pricePerUnit != null ? (r.pricePerUnit * r.totalIn).toFixed(2) : '');
        return base;
      });
      downloadCsv(filename, rows, headers);
    } else {
      const headers = ['Order #', 'Customer', 'Description', 'Status', 'Delivery Date'];
      const rows = orders.map(r => [
        r.orderNumber, r.customer?.name ?? '', r.description ?? '', r.status,
        r.deliveryDate ? new Date(r.deliveryDate).toLocaleDateString('en-IN') : '',
      ]);
      downloadCsv(filename, rows, headers);
    }
  }

  return (
    <div className="p-6">
      {/* Header with month nav */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-lg">←</button>
          <span className="font-medium text-slate-700 min-w-[120px] text-center">{rangeLabel}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-lg">→</button>
          <button
            onClick={handleExport}
            className="ml-2 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
          >
            ↓ CSV
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
          >
            ⎙ Print
          </button>
        </div>
      </div>

      {/* Summary stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Production</p>
          <p className="text-2xl font-bold mt-1">{totProd.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-400">kg produced</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Waste</p>
          <p className="text-2xl font-bold mt-1">{totWaste.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-400">kg waste</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Attendance</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{totPresent}</p>
          <p className="text-xs text-slate-400">present / {totAbsent} absent</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">QC Pass Rate</p>
          <p className="text-2xl font-bold mt-1">{totQcPass + totQcFail === 0 ? '—' : `${((totQcPass / (totQcPass + totQcFail)) * 100).toFixed(0)}%`}</p>
          <p className="text-xs text-slate-400">{totQcPass} pass / {totQcFail} fail</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Store IN</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{totStoreIn.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-400">units received this month</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Store OUT</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{totStoreOut.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-400">units issued this month</p>
        </div>
        {isOwner && totStoreValue !== null && (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Store IN Value</p>
            <p className="text-2xl font-bold mt-1">₹{totStoreValue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</p>
            <p className="text-xs text-slate-400">value of items received</p>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'production' && (
        <DataTable
          columns={prodCols}
          rows={production.rows}
          rowKey={r => r.orderNumber}
          emptyTitle="No production data"
          emptyBody="No logs found for this period."
        />
      )}
      {tab === 'attendance' && (
        <DataTable
          columns={attCols}
          rows={attendance.rows}
          rowKey={r => r.code}
          emptyTitle="No attendance data"
          emptyBody="No attendance records found for this period."
        />
      )}
      {tab === 'qc' && (
        <DataTable
          columns={qcCols}
          rows={qc.rows}
          rowKey={r => r.orderNumber}
          emptyTitle="No QC data"
          emptyBody="No QC checks found for this period."
        />
      )}
      {tab === 'orders' && (
        <DataTable
          columns={orderCols}
          rows={orders}
          rowKey={r => r.id}
          emptyTitle="No orders"
          emptyBody="No orders created in this period."
        />
      )}
      {tab === 'store' && (
        <DataTable
          columns={storeCols}
          rows={store.rows}
          rowKey={r => r.id}
          emptyTitle="No store transactions"
          emptyBody="No store movements found for this period."
        />
      )}
    </div>
  );
}
