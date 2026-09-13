/**
 * MIS role vocabulary — pure, no Prisma and no React.
 *
 * The MisRole enum is mirrored here as a plain union so that this file (and the
 * components that import it) never pull the Prisma client into a bundle. The
 * completeness test below fails if the two ever drift apart.
 */

import type { BadgeTone } from '@/components/mis/kit/status-badge';
import type { TranslationKey } from '@/lib/mis/i18n';

export const MIS_ROLES = [
  'OWNER',
  'ADMIN',
  'SUPERVISOR',
  'QC',
  'ATTENDANCE_OPERATOR',
  'SUPER_ATTENDANCE_OPERATOR',
  'WORKER',
] as const;

export type MisRoleName = (typeof MIS_ROLES)[number];

export function isMisRole(value: unknown): value is MisRoleName {
  return typeof value === 'string' && (MIS_ROLES as readonly string[]).includes(value);
}

/** The i18n key for a role. Role names are never hard-coded in English. */
export function roleLabelKey(role: MisRoleName): TranslationKey {
  return `role.${role}` as TranslationKey;
}

/**
 * Badge colour per role.
 *
 * Colour is decoration only — RoleBadge always renders the name beside it, so
 * nothing here carries meaning on its own.
 */
export function roleTone(role: MisRoleName): BadgeTone {
  switch (role) {
    case 'OWNER':
      return 'critical';
    case 'ADMIN':
      return 'warning';
    case 'SUPERVISOR':
      return 'info';
    case 'QC':
      return 'good';
    case 'ATTENDANCE_OPERATOR':
    case 'SUPER_ATTENDANCE_OPERATOR':
      return 'neutral';
    case 'WORKER':
      return 'neutral';
  }
}

/**
 * Which roles may this role hand out?
 *
 * An Admin cannot mint an Owner — that is the whole point. Evaluated on the
 * server; only the resulting list is sent to the browser, never this rule.
 */
export function assignableRoles(actor: MisRoleName | null): MisRoleName[] {
  if (actor === 'OWNER') {
    return [...MIS_ROLES];
  }
  if (actor === 'ADMIN') {
    return MIS_ROLES.filter((r) => r !== 'OWNER');
  }
  return [];
}
