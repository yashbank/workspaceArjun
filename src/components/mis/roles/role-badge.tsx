'use client';

import { roleLabelKey, roleTone, type MisRoleName } from '@/lib/mis/roles';

import { StatusBadge } from '../kit/status-badge';
import { useT } from '../shell/locale-provider';

/**
 * One place that decides how a role looks and reads.
 *
 * Every later screen renders roles through this, so a role can never be a
 * different colour on two screens.
 *
 * The name is always rendered — colour alone must not carry meaning, and at
 * 360px on a sunlit factory floor a colour difference is the first thing to go.
 */
export function RoleBadge({ role }: { role: MisRoleName | null }) {
  const t = useT();

  if (!role) {
    return <StatusBadge tone="neutral">{t('role.none')}</StatusBadge>;
  }

  return <StatusBadge tone={roleTone(role)}>{t(roleLabelKey(role))}</StatusBadge>;
}
