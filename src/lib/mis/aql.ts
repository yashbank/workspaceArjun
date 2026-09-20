/**
 * The AQL (Acceptable Quality Level) accept/reject calculation.
 *
 * Pure and dependency-free — no Prisma import — so a client component can
 * render a breakdown from a result the server already computed, and the
 * server module and any future client-side preview always agree.
 *
 * A sample is scored per severity independently: exceeding the max allowed
 * defect count for *any one* severity rejects the whole sample, regardless of
 * the other two. A sample smaller than the required size is not itself a
 * rejection reason — it is surfaced as `sampleSizeMet: false` so the caller
 * can warn without inventing a fourth outcome.
 */

export type AqlSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';

export type AqlSeverityCounts = {
  critical: number;
  major: number;
  minor: number;
};

export type AqlThresholds = {
  /** Required sample size for the thresholds below to apply at full confidence. */
  sampleSize: number;
  criticalMax: number;
  majorMax: number;
  minorMax: number;
};

export type AqlDecision = 'ACCEPT' | 'REJECT';

export type AqlBreakdownLine = {
  severity: AqlSeverity;
  found: number;
  max: number;
  exceeded: boolean;
};

export type AqlResult = {
  decision: AqlDecision;
  sampleSize: number;
  sampleSizeRequired: number;
  sampleSizeMet: boolean;
  breakdown: AqlBreakdownLine[];
  thresholds: AqlThresholds;
};

export function evaluateAql(
  sampleSize: number,
  defects: AqlSeverityCounts,
  thresholds: AqlThresholds,
): AqlResult {
  const breakdown: AqlBreakdownLine[] = [
    { severity: 'CRITICAL', found: defects.critical, max: thresholds.criticalMax, exceeded: defects.critical > thresholds.criticalMax },
    { severity: 'MAJOR', found: defects.major, max: thresholds.majorMax, exceeded: defects.major > thresholds.majorMax },
    { severity: 'MINOR', found: defects.minor, max: thresholds.minorMax, exceeded: defects.minor > thresholds.minorMax },
  ];

  const decision: AqlDecision = breakdown.some((line) => line.exceeded) ? 'REJECT' : 'ACCEPT';

  return {
    decision,
    sampleSize,
    sampleSizeRequired: thresholds.sampleSize,
    sampleSizeMet: sampleSize >= thresholds.sampleSize,
    breakdown,
    thresholds,
  };
}
