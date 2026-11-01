'use client';

import { GENERAL_REASON_MIN, NOT_LINKED_TO_ORDER } from '@/lib/mis/general-use';
import { Combobox } from '@/components/ui/combobox';

import { InfoCard, SectionLabel } from '../home/cards';

/**
 * R2-80 / R2-62 / Q11 — the "General / factory use" block.
 *
 * Shown whenever NO order is picked: stock cannot leave unattributed, so the person gives a reason (grease, oil,
 * consumables…) and picks the cost centre it is charged to. Owner + Admin are notified when it is raised. The server
 * enforces the same rule; this only lets the person fill it in.
 */
export type GeneralFields = { reason: string; costCenter: string };
export const EMPTY_GENERAL: GeneralFields = { reason: '', costCenter: '' };

export function GeneralUseFields({
  value,
  onChange,
  costCenters,
}: {
  value: GeneralFields;
  onChange: (next: GeneralFields) => void;
  costCenters: { value: string; label: string }[];
}) {
  return (
    <InfoCard>
      <SectionLabel>General / factory use ({NOT_LINKED_TO_ORDER})</SectionLabel>
      <p className="mt-1 text-sm text-slate-600">No order picked, so say what this is for. The Owner and Admin are told.</p>
      <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor="general-reason">Reason (grease, oil, consumables…)</label>
      <input
        id="general-reason"
        value={value.reason}
        onChange={(e) => onChange({ ...value, reason: e.target.value })}
        autoComplete="off"
        className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900"
      />
      {value.reason.trim().length > 0 && value.reason.trim().length < GENERAL_REASON_MIN && (
        <p className="mt-1 text-xs text-red-700">At least {GENERAL_REASON_MIN} characters.</p>
      )}
      <div className="mt-3">
        {costCenters.length === 0 ? (
          <p className="text-sm text-slate-500">No cost centres are set up yet — ask an Admin to add them under Masters.</p>
        ) : (
          // R2-348: searchable, code + label; required before Confirm (the server refuses without it).
          <Combobox
            label="Cost centre (required)"
            value={value.costCenter || null}
            options={costCenters.map((c) => ({ value: c.value, label: c.label, hint: c.value !== c.label ? c.value : undefined }))}
            onChange={(v) => onChange({ ...value, costCenter: v })}
            placeholder="Type a cost centre code or name"
          />
        )}
      </div>
    </InfoCard>
  );
}
