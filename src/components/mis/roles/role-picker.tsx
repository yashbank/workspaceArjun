'use client';

import { roleLabelKey, type MisRoleName } from '@/lib/mis/roles';

import { Select } from '../kit/select';
import { useT } from '../shell/locale-provider';

/**
 * Pick a role to assign.
 *
 * `options` is computed on the server by assignableRoles() and passed in — the
 * rule that an Admin cannot mint an Owner is never shipped to the browser, only
 * the resulting list. A picker rendered with an empty list is the correct
 * outcome for a supervisor, not a bug.
 */
export function RolePicker({
  value,
  options,
  onChange,
  label,
  error,
  disabled,
}: {
  value: MisRoleName | null;
  /** Roles the current user is permitted to assign, resolved server-side. */
  options: MisRoleName[];
  onChange: (role: MisRoleName) => void;
  label?: string;
  error?: string | null;
  disabled?: boolean;
}) {
  const t = useT();

  return (
    <Select
      label={label ?? t('role.select')}
      value={value}
      disabled={disabled || options.length === 0}
      error={error}
      placeholder={t('role.select')}
      options={options.map((role) => ({ value: role, label: t(roleLabelKey(role)) }))}
      onChange={(next) => onChange(next as MisRoleName)}
    />
  );
}
