/**
 * The option groups the generic master table serves.
 *
 * This is a plain list, not a Prisma enum, so an eighth group is a constant here
 * and a row in the database — no migration and no new server code, which is the
 * whole reason MisMasterOption exists.
 */
export const MASTER_GROUPS = [
  'GSM',
  'SIZE',
  'SUBSTRATE',
  'COATING',
  'COLOUR',
  'UNIT',
  'ITEM_TYPE',
] as const;

export type MasterGroup = (typeof MASTER_GROUPS)[number];

/** Turn a typed label into a stable machine value: "80 GSM" -> "80_GSM". */
export function toOptionValue(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
