/**
 * The verdict of a set of QC checks (R3-QCR B74): pure, client-safe.
 *
 * A check is "resolved" by a LATER check on the same stage + parameter: only the latest check per
 * (bomStageId, parameterName) counts. An earlier FAIL followed by a later PASS is resolved.
 * This mirrors the latest-per-key logic of `evaluateCloseGates` in `order-transitions.ts` (MIS-163:
 * "a check is resolved only by a later PASS on the same order/stage/parameter"), copied here rather
 * than imported because that file is owned by another cluster this wave.
 */

export type VerdictCheck = {
  bomStageId?: string | null;
  parameterName?: string | null;
  result: string;
  checkTime: Date | string;
};

export type Verdict = 'PASS' | 'FAIL' | 'NA';

const keyOf = (c: VerdictCheck) => `${c.bomStageId ?? ''}\u0000${(c.parameterName ?? 'General').trim().toLowerCase()}`;
const timeOf = (c: VerdictCheck) => new Date(c.checkTime).getTime();

/** The latest check per (bomStageId, parameterName). A tie on time keeps the one listed later. */
export function latestChecks<T extends VerdictCheck>(checks: T[]): T[] {
  const latest = new Map<string, T>();
  for (const c of checks) {
    const k = keyOf(c);
    const cur = latest.get(k);
    if (!cur || timeOf(c) >= timeOf(cur)) latest.set(k, c);
  }
  return [...latest.values()];
}

/** FAIL if any key's latest check is FAIL; else PASS if any latest is PASS; else NA (also for no checks). */
export function latestVerdict<T extends VerdictCheck>(checks: T[]): { overall: Verdict; latest: T[]; unresolvedFailures: T[] } {
  const latest = latestChecks(checks);
  const unresolvedFailures = latest.filter((c) => c.result === 'FAIL');
  const overall: Verdict = unresolvedFailures.length > 0 ? 'FAIL' : latest.some((c) => c.result === 'PASS') ? 'PASS' : 'NA';
  return { overall, latest, unresolvedFailures };
}
