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

/* ------------------------------------------------------------------------------------------------
 * R2-233 — ANSI/ASQ Z1.4 (ISO 2859-1) single sampling, NORMAL inspection.
 * Lot size -> sample-size code letter (Table I, General Inspection Levels I/II/III), then
 * letter + AQL -> sample size and Ac/Re (Table II-A). Pure constants + lookups, no Prisma.
 * ---------------------------------------------------------------------------------------------- */

export type InspectionLevel = 'I' | 'II' | 'III';
export type CodeLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L' | 'M' | 'N' | 'P' | 'Q' | 'R';

export const INSPECTION_LEVELS: readonly InspectionLevel[] = ['I', 'II', 'III'];

/** Table II-A, "sample size" column, in code-letter order. */
export const CODE_LETTER_SAMPLE_SIZE: Record<CodeLetter, number> = {
  A: 2, B: 3, C: 5, D: 8, E: 13, F: 20, G: 32, H: 50, J: 80, K: 125, L: 200, M: 315, N: 500, P: 800, Q: 1250, R: 2000,
};
const LETTERS = Object.keys(CODE_LETTER_SAMPLE_SIZE) as CodeLetter[];

/** Table I: upper bound of each lot-size band (Infinity = "and over") and the letter for Levels I, II, III. */
export const LOT_SIZE_CODE_LETTERS: readonly { maxLot: number; letters: Record<InspectionLevel, CodeLetter> }[] = [
  { maxLot: 8, letters: { I: 'A', II: 'A', III: 'B' } },
  { maxLot: 15, letters: { I: 'A', II: 'B', III: 'C' } },
  { maxLot: 25, letters: { I: 'B', II: 'C', III: 'D' } },
  { maxLot: 50, letters: { I: 'C', II: 'D', III: 'E' } },
  { maxLot: 90, letters: { I: 'C', II: 'E', III: 'F' } },
  { maxLot: 150, letters: { I: 'D', II: 'F', III: 'G' } },
  { maxLot: 280, letters: { I: 'E', II: 'G', III: 'H' } },
  { maxLot: 500, letters: { I: 'F', II: 'H', III: 'J' } },
  { maxLot: 1200, letters: { I: 'G', II: 'J', III: 'K' } },
  { maxLot: 3200, letters: { I: 'H', II: 'K', III: 'L' } },
  { maxLot: 10000, letters: { I: 'J', II: 'L', III: 'M' } },
  { maxLot: 35000, letters: { I: 'K', II: 'M', III: 'N' } },
  { maxLot: 150000, letters: { I: 'L', II: 'N', III: 'P' } },
  { maxLot: 500000, letters: { I: 'M', II: 'P', III: 'Q' } },
  { maxLot: Infinity, letters: { I: 'N', II: 'Q', III: 'R' } },
];

/** The AQL columns of Table II-A, with the code letter whose row holds that column's first Ac 0 / Re 1. */
export const AQL_FIRST_ACCEPT_LETTER: Record<string, CodeLetter> = {
  '0.065': 'N', '0.10': 'M', '0.15': 'L', '0.25': 'K', '0.40': 'J', '0.65': 'H',
  '1.0': 'G', '1.5': 'F', '2.5': 'E', '4.0': 'D', '6.5': 'C',
};
export const AQL_VALUES: readonly number[] = Object.keys(AQL_FIRST_ACCEPT_LETTER).map(Number);

/** Down a column from the first 0/1 row the accept/reject pairs step through this series (Table II-A). */
const ACCEPT_REJECT_STEPS: readonly (readonly [number, number])[] = [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [7, 8], [10, 11], [14, 15], [21, 22]];

export type AqlPlan = {
  level: InspectionLevel;
  /** The letter the lot size gives (Table I). */
  codeLetter: CodeLetter;
  /** The letter actually used after following Table II-A's arrows (equals `codeLetter` when there is no arrow). */
  usedLetter: CodeLetter;
  aql: number;
  sampleSize: number;
  accept: number;
  reject: number;
};

export function parseInspectionLevel(raw: string | null | undefined): InspectionLevel | null {
  const word = (raw ?? '').trim().toUpperCase().replace(/^LEVEL\s*/, '');
  if (word === 'I' || word === '1') return 'I';
  if (word === 'II' || word === '2') return 'II';
  if (word === 'III' || word === '3') return 'III';
  return null;
}

export function sampleSizeCodeLetter(lotSize: number, level: InspectionLevel): CodeLetter {
  const band = LOT_SIZE_CODE_LETTERS.find((b) => lotSize <= b.maxLot) ?? LOT_SIZE_CODE_LETTERS[LOT_SIZE_CODE_LETTERS.length - 1];
  return band.letters[level];
}

/** The table AQL nearest to `aql` (a setting such as 2.5 or "1"). */
export function nearestAql(aql: number): number {
  return AQL_VALUES.reduce((best, v) => (Math.abs(v - aql) < Math.abs(best - aql) ? v : best), AQL_VALUES[0]);
}

/**
 * Table II-A for one letter and AQL. Above a column's first 0/1 row the table has a down arrow (use the
 * first row below that has numbers); past 21/22 it has an up arrow (use the first row above that has them).
 * The sample size follows the row actually used. A lot no larger than that sample is inspected 100%.
 */
export function aqlPlan(lotSize: number, level: InspectionLevel, aql: number): AqlPlan {
  const aqlValue = nearestAql(aql);
  const key = Object.keys(AQL_FIRST_ACCEPT_LETTER).find((k) => Number(k) === aqlValue)!;
  const first = LETTERS.indexOf(AQL_FIRST_ACCEPT_LETTER[key]);
  const codeLetter = sampleSizeCodeLetter(lotSize, level);
  const step = Math.min(Math.max(LETTERS.indexOf(codeLetter) - first, 0), ACCEPT_REJECT_STEPS.length - 1);
  const usedLetter = LETTERS[first + step];
  const [accept, reject] = ACCEPT_REJECT_STEPS[step];
  return { level, codeLetter, usedLetter, aql: aqlValue, sampleSize: Math.min(CODE_LETTER_SAMPLE_SIZE[usedLetter], Math.max(1, Math.floor(lotSize))), accept, reject };
}

/**
 * The thresholds `evaluateAql` scores against for a Z1.4 plan: no critical defect, Ac for major and minor.
 * R2-314: minor defects follow their own (looser) plan when one is given; the sample is the larger of the two.
 */
export function thresholdsFromPlan(plan: AqlPlan, minorPlan: AqlPlan = plan): AqlThresholds {
  return { sampleSize: Math.max(plan.sampleSize, minorPlan.sampleSize), criticalMax: 0, majorMax: plan.accept, minorMax: minorPlan.accept };
}

export const AQL_LEVEL_KEY = 'qc.aql_level';
export const AQL_LIMIT_KEY = 'qc.acceptable_quality_limit';
const DEFAULT_AQL_LIMIT = 2.5;
/** R2-314: separate acceptable-quality limits for major and minor defects (Settings > AQL). */
export const AQL_MAJOR_LIMIT_KEY = 'AQL_MAJOR_LIMIT';
export const AQL_MINOR_LIMIT_KEY = 'AQL_MINOR_LIMIT';
export const DEFAULT_AQL_MAJOR_LIMIT = 1.5;
export const DEFAULT_AQL_MINOR_LIMIT = 4.0;

const positive = (raw: string | null | undefined): number | null => {
  const n = Number.parseFloat(raw ?? '');
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * R2-314: the Z1.4 plans for a lot — one at the Major limit, one at the Minor limit (each falling back to the
 * legacy single limit, then to 1.5 / 4.0). null = no level set (or unreadable): keep the stored thresholds.
 */
export async function resolveAqlPlans(read: (key: string) => Promise<string | null>, lotSize: number): Promise<{ major: AqlPlan; minor: AqlPlan } | null> {
  try {
    const level = parseInspectionLevel(await read(AQL_LEVEL_KEY));
    if (!level) return null;
    const legacy = positive(await read(AQL_LIMIT_KEY));
    const major = positive(await read(AQL_MAJOR_LIMIT_KEY)) ?? legacy ?? DEFAULT_AQL_MAJOR_LIMIT;
    const minor = positive(await read(AQL_MINOR_LIMIT_KEY)) ?? legacy ?? DEFAULT_AQL_MINOR_LIMIT;
    return { major: aqlPlan(lotSize, level, major), minor: aqlPlan(lotSize, level, minor) };
  } catch {
    return null;
  }
}

/**
 * The Z1.4 plan for a lot under the saved level (`qc.aql_level`) and acceptable quality limit
 * (`qc.acceptable_quality_limit`, 2.5 when unset). null = no level set (or unreadable): keep the stored thresholds.
 */
export async function resolveAqlPlan(read: (key: string) => Promise<string | null>, lotSize: number): Promise<AqlPlan | null> {
  try {
    const level = parseInspectionLevel(await read(AQL_LEVEL_KEY));
    if (!level) return null;
    const limit = Number.parseFloat((await read(AQL_LIMIT_KEY)) ?? '');
    return aqlPlan(lotSize, level, Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_AQL_LIMIT);
  } catch {
    return null;
  }
}
