/**
 * The BPR work-flow processes, in the order the client's own form prints them.
 *
 * Source: `Batch Production Record_BPP.pdf` p1, the PLANNING section's "Work
 * flow:" checkbox row. A planner ticks the ones this job needs; the unticked
 * ones become NOT_APPLICABLE phases (DEVELOPMENT_GUIDE.md Appendix A §A.1).
 *
 * This list is the *seed source*, not the gating data. Phases are always built
 * from `MisProcess` rows (MIS-145: master data, not a hardcoded list) — five of
 * these eleven already exist in the live master under the client's own codes,
 * and `ensureBprProcesses()` adds only the missing ones, matched by name.
 *
 * Pure and client-safe: no Prisma, no React.
 */
export const BPR_WORKFLOW = [
  'Board Trimming',
  'Printing',
  'Lamination',
  'Coating',
  'Corrugation',
  'Die Cutting',
  'Blanking',
  'Sorting',
  'Window Pasting',
  'Foiling',
  'Pasting',
] as const;

export type BprProcessName = (typeof BPR_WORKFLOW)[number];

/** Case- and space-insensitive key for matching a workflow name to a master row. */
export function processNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Where a process sits in the BPR work flow, or null if it is not on the form. */
export function bprSequenceOf(name: string): number | null {
  const key = processNameKey(name);
  const index = BPR_WORKFLOW.findIndex((p) => processNameKey(p) === key);
  return index === -1 ? null : index + 1;
}
