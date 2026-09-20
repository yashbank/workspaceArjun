'use client';

import type { WageTypeCode } from '@/server/mis/wage-type';

import { Select } from '../kit/select';

/**
 * Pick a wage type by its code — never its amount.
 *
 * `options` is `code` + `name` only, resolved server-side by listWageCodes(),
 * which is itself Owner-gated. This component has no `amount` in its props,
 * so there is nothing here that could render one even by accident — the
 * guarantee is structural, not a rule someone has to remember to follow.
 */
export function WagePicker({
  value,
  options,
  onChange,
  label = 'Wage type',
  error,
  disabled,
}: {
  value: string | null;
  options: WageTypeCode[];
  onChange: (code: string) => void;
  label?: string;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <Select
      label={label}
      value={value}
      disabled={disabled || options.length === 0}
      error={error}
      placeholder="Select a wage type"
      options={options.map((o) => ({ value: o.code, label: `${o.code} · ${o.name}` }))}
      onChange={onChange}
    />
  );
}
