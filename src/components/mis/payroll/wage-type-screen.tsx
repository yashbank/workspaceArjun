'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { Input, NumberInput, DateInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { DEFAULT_FACTORY_TIMEZONE, factoryDateKey, formatFactoryDate } from '@/lib/mis/factory-time';
import type { WageRevision, WageTypeCode, WageTypeRow } from '@/server/mis/wage-type';

import {
  addWageRateAction,
  createWageTypeAction,
  setWageTypeActiveAction,
  updateWageTypeDetailsAction,
} from '@/app/(mis)/mis/settings/wages/actions';

import { WagePicker } from './wage-picker';

// R2-113: only the units payroll actually prices (PAYROLL_SUPPORTED_UNITS). Hourly and piece rate
// are not offered — the server refuses them too.
const UNIT_OPTIONS = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'MONTHLY', label: 'Monthly' },
];

function todayIso() {
  return factoryDateKey(new Date(), DEFAULT_FACTORY_TIMEZONE);
}

const REVISION_TONE = { SCHEDULED: 'info', IN_FORCE: 'good', PAST: 'neutral' } as const;
const REVISION_LABEL = { SCHEDULED: 'Scheduled', IN_FORCE: 'In force', PAST: 'Past' } as const;

export function WageTypeScreen({
  wageTypes,
  codes,
  history = [],
}: {
  wageTypes: WageTypeRow[];
  codes: WageTypeCode[];
  /** R2-114: every dated rate row, newest first within a code. */
  history?: WageRevision[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // R2-114: edit details (name labels) + rate history, per code.
  const [detailsFor, setDetailsFor] = useState<WageTypeRow | null>(null);
  const [detailsName, setDetailsName] = useState('');
  const [detailsNameHi, setDetailsNameHi] = useState('');
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  // Add-wage-type form
  const [name, setName] = useState('');
  const [nameHi, setNameHi] = useState('');
  const [unit, setUnit] = useState<string>('DAILY');
  const [amount, setAmount] = useState('');
  const [otRate, setOtRate] = useState('');
  const [multiplierBasis, setMultiplierBasis] = useState<string>('PER_MONTH');
  const [hra, setHra] = useState('');
  const [allowance, setAllowance] = useState('');
  const [bonus, setBonus] = useState('');

  // Add-rate form — the code-only picker in use.
  const [rateCode, setRateCode] = useState<string | null>(null);
  const [rateAmount, setRateAmount] = useState('');
  const [rateEffectiveFrom, setRateEffectiveFrom] = useState(todayIso());
  const [rateOtRate, setRateOtRate] = useState('');
  const [rateBasis, setRateBasis] = useState<string>('PER_MONTH');
  const [rateHra, setRateHra] = useState('');
  const [rateAllowance, setRateAllowance] = useState('');
  const [rateBonus, setRateBonus] = useState('');

  // "Add wage type": a blank field means this brand-new code sets nothing for it — null.
  const numOrNull = (s: string) => (s.trim() === '' ? null : Number.parseFloat(s));
  // "Update a rate": a blank field means carry over the code's current value — undefined, so
  // `addWageRate`'s own `extra.x !== undefined ? extra.x : existing.x` falls through to it,
  // matching this form's own "left blank here carries over" copy.
  const numOrUndefined = (s: string) => (s.trim() === '' ? undefined : Number.parseFloat(s));

  const openAdd = () => {
    setName('');
    setNameHi('');
    setUnit('DAILY');
    setAmount('');
    setOtRate('');
    setMultiplierBasis('PER_MONTH');
    setHra('');
    setAllowance('');
    setBonus('');
    setSaveError(null); setAddOpen(true);
  };

  const openRate = () => {
    setRateCode(null);
    setRateAmount('');
    setRateEffectiveFrom(todayIso());
    setRateOtRate('');
    setRateBasis('PER_MONTH');
    setRateHra('');
    setRateAllowance('');
    setRateBonus('');
    setSaveError(null);
    setRateOpen(true);
  };

  const handleCreate = () => {
    startTransition(async () => {
      const r = await createWageTypeAction({
        name,
        nameHi: nameHi || undefined,
        unit: unit as WageTypeRow['unit'],
        amount: Number.parseFloat(amount) || 0,
        otRatePerHour: numOrNull(otRate),
        multiplierBasis: multiplierBasis as WageTypeRow['multiplierBasis'],
        hraAmount: numOrNull(hra),
        allowanceAmount: numOrNull(allowance),
        bonusAmount: numOrNull(bonus),
      });
      if (!r.ok) { setSaveError(r.detail); return; }
      setAddOpen(false);
    });
  };

  const handleAddRate = () => {
    if (!rateCode) return;
    startTransition(async () => {
      const r = await addWageRateAction(rateCode, Number.parseFloat(rateAmount) || 0, rateEffectiveFrom, {
        otRatePerHour: numOrUndefined(rateOtRate),
        multiplierBasis: rateBasis as WageTypeRow['multiplierBasis'],
        hraAmount: numOrUndefined(rateHra),
        allowanceAmount: numOrUndefined(rateAllowance),
        bonusAmount: numOrUndefined(rateBonus),
      });
      if (!r.ok) { setSaveError(r.detail); return; }
      setRateOpen(false);
    });
  };

  const openDetails = (row: WageTypeRow) => {
    setDetailsFor(row);
    setDetailsName(row.name);
    setDetailsNameHi(row.nameHi ?? '');
    setSaveError(null);
  };

  const handleSaveDetails = () => {
    if (!detailsFor) return;
    startTransition(async () => {
      const r = await updateWageTypeDetailsAction(detailsFor.code, { name: detailsName, nameHi: detailsNameHi || null });
      if (!r.ok) { setSaveError(r.detail); return; }
      setDetailsFor(null);
    });
  };

  const revisions = historyFor ? history.filter((h) => h.code === historyFor) : [];

  const toggleActive = (row: WageTypeRow) => {
    startTransition(async () => {
      const r = await setWageTypeActiveAction(row.code, !row.isActive);
      if (!r.ok) setSaveError(r.detail);
    });
  };

  const columns: Column<WageTypeRow>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs text-slate-500">{r.code}</span> },
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <div>
          <div>{r.name}</div>
          {r.nameHi && <div className="text-xs text-slate-500">{r.nameHi}</div>}
        </div>
      ),
    },
    { key: 'unit', header: 'Unit', render: (r) => r.unit },
    { key: 'amount', header: 'Amount', render: (r) => `₹${r.amount.toFixed(2)}` },
    {
      key: 'ot',
      header: 'OT rate',
      render: (r) => (r.otRatePerHour != null ? `₹${r.otRatePerHour.toFixed(2)}/hr` : <span className="text-slate-400">not set</span>),
    },
    {
      key: 'components',
      header: 'Components',
      render: (r) => {
        const parts = [
          r.hraAmount != null && `HRA ₹${r.hraAmount.toFixed(0)}`,
          r.allowanceAmount != null && `Allowance ₹${r.allowanceAmount.toFixed(0)}`,
          r.bonusAmount != null && `Bonus ₹${r.bonusAmount.toFixed(0)}`,
        ].filter(Boolean);
        return parts.length > 0 ? <span className="text-xs text-slate-600">{parts.join(' · ')}</span> : <span className="text-slate-400">—</span>;
      },
    },
    {
      key: 'effectiveFrom',
      header: 'Effective from',
      render: (r) => formatFactoryDate(new Date(r.effectiveFrom), DEFAULT_FACTORY_TIMEZONE),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (r) => <StatusBadge tone={r.isActive ? 'good' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</StatusBadge>,
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" onClick={() => openDetails(r)} disabled={isPending}>Edit details</Button>
          <Button variant="ghost" onClick={() => setHistoryFor(r.code)}>
            History ({history.filter((h) => h.code === r.code).length})
          </Button>
          <Button variant="ghost" onClick={() => toggleActive(r)} disabled={isPending}>
            {r.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-4">
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
          🔒 Visible to you only
        </div>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Wage types</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every other screen references a wage by its code, never by this amount.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button onClick={openAdd}>+ Add wage type</Button>
          <Button variant="secondary" onClick={openRate} disabled={codes.length === 0}>
            + Update a rate
          </Button>
        </div>
      </div>

      {saveError && !addOpen && !rateOpen && !detailsFor && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
      <DataTable
        columns={columns}
        rows={wageTypes}
        rowKey={(r) => r.id}
        emptyTitle="No wage types yet"
        emptyBody="Add your first wage type to replace the flat default rate."
      />

      <SlideOver open={addOpen} onClose={() => setAddOpen(false)} title="Add wage type">
        <div className="flex flex-col gap-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="General daily wage" required />
          <Input label="Name (Hindi)" value={nameHi} onChange={(e) => setNameHi(e.target.value)} placeholder="सामान्य दैनिक मजदूरी" />
          <Select
            label="Unit"
            value={unit}
            options={UNIT_OPTIONS}
            onChange={setUnit}
          />
          <NumberInput label="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <NumberInput label="OT rate per hour (₹, optional)" value={otRate} onChange={(e) => setOtRate(e.target.value)} />
          {unit === 'DAILY' && (
            <div>
              <Select
                label="Extra-pay multiplier basis"
                value={multiplierBasis}
                options={[{ value: 'PER_MONTH', label: 'Per day (month-equivalent)' }, { value: 'PER_HOUR', label: 'Per hour' }]}
                onChange={setMultiplierBasis}
              />
              <p className="mt-1 text-xs text-slate-500">D28 — which figure a multiplier extra-pay day multiplies for someone on this code.</p>
            </div>
          )}
          <NumberInput label="HRA (₹, optional)" value={hra} onChange={(e) => setHra(e.target.value)} />
          <NumberInput label="Allowance (₹, optional)" value={allowance} onChange={(e) => setAllowance(e.target.value)} />
          <NumberInput label="Bonus (₹, optional)" value={bonus} onChange={(e) => setBonus(e.target.value)} />
          {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleCreate} disabled={isPending || !name || !amount}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={rateOpen} onClose={() => setRateOpen(false)} title="Update a rate">
        <div className="flex flex-col gap-4">
          <WagePicker value={rateCode} options={codes} onChange={setRateCode} />
          <NumberInput label="New amount (₹)" value={rateAmount} onChange={(e) => setRateAmount(e.target.value)} required />
          <DateInput
            label="Effective from"
            value={rateEffectiveFrom}
            onChange={(e) => setRateEffectiveFrom(e.target.value)}
          />
          <NumberInput label="OT rate per hour (₹, optional)" value={rateOtRate} onChange={(e) => setRateOtRate(e.target.value)} />
          {codes.find((c) => c.code === rateCode)?.unit === 'DAILY' && (
            <Select
              label="Extra-pay multiplier basis"
              value={rateBasis}
              options={[{ value: 'PER_MONTH', label: 'Per day (month-equivalent)' }, { value: 'PER_HOUR', label: 'Per hour' }]}
              onChange={setRateBasis}
            />
          )}
          <NumberInput label="HRA (₹, optional)" value={rateHra} onChange={(e) => setRateHra(e.target.value)} />
          <NumberInput label="Allowance (₹, optional)" value={rateAllowance} onChange={(e) => setRateAllowance(e.target.value)} />
          <NumberInput label="Bonus (₹, optional)" value={rateBonus} onChange={(e) => setRateBonus(e.target.value)} />
          <p className="text-sm text-slate-500">
            The old rate stays on record for pay periods already decided — this adds a new one, it never overwrites history. Any field left blank here carries over from the code&apos;s current row.
          </p>
          {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAddRate} disabled={isPending || !rateCode || !rateAmount}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="ghost" onClick={() => setRateOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={detailsFor !== null} onClose={() => setDetailsFor(null)} title={`Edit details · ${detailsFor?.code ?? ''}`}>
        <div className="flex flex-col gap-4">
          <Input label="Name" value={detailsName} onChange={(e) => setDetailsName(e.target.value)} required />
          <Input label="Name (Hindi)" value={detailsNameHi} onChange={(e) => setDetailsNameHi(e.target.value)} />
          <p className="text-sm text-slate-500">
            Renames this code on every dated row. Rates, OT, components and unit do not change — use “Update a rate” for that.
          </p>
          {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSaveDetails} disabled={isPending || !detailsName.trim()}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="ghost" onClick={() => setDetailsFor(null)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={historyFor !== null} onClose={() => setHistoryFor(null)} title={`Rate history · ${historyFor ?? ''}`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-500">Every rate this code has had, newest first. A pay period is always priced at the rate in force on each day.</p>
          {revisions.length === 0 ? (
            <p className="text-sm text-slate-500">No rates recorded.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {revisions.map((h) => (
                <li key={h.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">From {formatFactoryDate(new Date(h.effectiveFrom), DEFAULT_FACTORY_TIMEZONE)}</span>
                    <StatusBadge tone={REVISION_TONE[h.status]}>{REVISION_LABEL[h.status]}</StatusBadge>
                  </div>
                  <div className="mt-1 text-slate-700">₹{h.amount.toFixed(2)} {h.unit === 'MONTHLY' ? 'a month' : 'a day'}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    OT {h.otRatePerHour != null ? `₹${h.otRatePerHour.toFixed(2)}/hr` : 'not set'}
                    {h.hraAmount != null && ` · HRA ₹${h.hraAmount.toFixed(0)}`}
                    {h.allowanceAmount != null && ` · Allowance ₹${h.allowanceAmount.toFixed(0)}`}
                    {h.bonusAmount != null && ` · Bonus ₹${h.bonusAmount.toFixed(0)}`}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SlideOver>
    </div>
  );
}
