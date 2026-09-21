import type { AqlThresholds } from '@/lib/mis/aql';
import { can } from '@/lib/mis/permissions';
import { isWageRuleKey, type WageRuleKey } from '@/lib/mis/rule-keys';
import { dbDateKey } from '@/lib/mis/attendance-month';
import { DEFAULT_FACTORY_TIMEZONE, dateKeyToDbDate, factoryDateKey, isValidTimeZone, resolveFactoryTimezone } from '@/lib/mis/factory-time';
import { validateSchedule } from '@/lib/mis/rules-ledger';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';

/**
 * AQL thresholds live in the same effective-dated store as every other
 * business rule, but are edited from their own Owner-only screen (aql.read),
 * never from the general Admin+Owner settings list — a threshold change
 * silently re-scores every QC sample decided from that moment on.
 */
const AQL_RULE_KEYS = ['AQL_SAMPLE_SIZE', 'AQL_CRITICAL_MAX', 'AQL_MAJOR_MAX', 'AQL_MINOR_MAX'] as const;
type AqlRuleKey = (typeof AQL_RULE_KEYS)[number];

const AQL_DEFAULTS: Record<AqlRuleKey, { value: string; label: string; description: string }> = {
  AQL_SAMPLE_SIZE: { value: '32', label: 'AQL sample size', description: 'Units inspected per QC sample.' },
  AQL_CRITICAL_MAX: { value: '0', label: 'AQL critical defect max', description: 'Max allowed critical defects in a sample before it rejects.' },
  AQL_MAJOR_MAX: { value: '2', label: 'AQL major defect max', description: 'Max allowed major defects in a sample before it rejects.' },
  AQL_MINOR_MAX: { value: '5', label: 'AQL minor defect max', description: 'Max allowed minor defects in a sample before it rejects.' },
};

/** Creates each AQL rule's first row if it has never been set. Idempotent. */
async function ensureAqlDefaults() {
  for (const ruleKey of AQL_RULE_KEYS) {
    const existing = await db.misBusinessRule.findFirst({ where: { ruleKey } });
    if (existing) continue;
    const { value, label, description } = AQL_DEFAULTS[ruleKey];
    await db.misBusinessRule.create({
      data: { ruleKey, ruleValue: value, valueType: 'number', label, description, effectiveFrom: new Date() },
    });
  }
}

/**
 * D7 (DECISIONS.md): line clearance validity is a mode, not a fixed window —
 * JOB (default), SHIFT or MINUTES — plus an optional cap on top of JOB/SHIFT
 * that also doubles as MINUTES's own fixed duration. Both live in the general
 * settings list (unlike AQL) since D7 asks for them to be editable without a
 * dedicated screen.
 */
const LINE_CLEARANCE_MODE_KEY = 'line_clearance.mode';
const LINE_CLEARANCE_MAX_MINUTES_KEY = 'line_clearance.max_minutes';
export type LineClearanceMode = 'JOB' | 'SHIFT' | 'MINUTES';

/** Creates the two line-clearance rule rows if they have never been set. Idempotent. */
async function ensureLineClearanceDefaults() {
  const existingMode = await db.misBusinessRule.findFirst({ where: { ruleKey: LINE_CLEARANCE_MODE_KEY } });
  if (!existingMode) {
    await db.misBusinessRule.create({
      data: {
        ruleKey: LINE_CLEARANCE_MODE_KEY,
        ruleValue: 'JOB',
        valueType: 'string',
        label: 'Line clearance mode',
        description: 'JOB (default, expires when the machine current order changes), SHIFT (expires at shift end), or MINUTES (fixed duration).',
        effectiveFrom: new Date(),
      },
    });
  }
  const existingCap = await db.misBusinessRule.findFirst({ where: { ruleKey: LINE_CLEARANCE_MAX_MINUTES_KEY } });
  if (!existingCap) {
    await db.misBusinessRule.create({
      data: {
        ruleKey: LINE_CLEARANCE_MAX_MINUTES_KEY,
        ruleValue: '120',
        valueType: 'number',
        label: 'Line clearance max minutes',
        description: 'Optional cap on top of JOB/SHIFT mode, or the fixed duration when mode is MINUTES. Whichever limit hits first wins.',
        effectiveFrom: new Date(),
      },
    });
  }
}

/**
 * D15: the offline queue's two tolerances. The *policy* — punches are
 * client-recorded, sign-offs are server-stamped, and a clock outside tolerance
 * parks rather than clamps — is the decision; these numbers are not, so they
 * live here and are editable without a deploy, exactly as D7's mode is.
 */
const OFFLINE_SKEW_KEY = 'offline.clock_skew_minutes';
const OFFLINE_MAX_AGE_KEY = 'offline.max_queue_age_hours';

async function ensureOfflineDefaults() {
  const existingSkew = await db.misBusinessRule.findFirst({ where: { ruleKey: OFFLINE_SKEW_KEY } });
  if (!existingSkew) {
    await db.misBusinessRule.create({
      data: {
        ruleKey: OFFLINE_SKEW_KEY,
        ruleValue: '15',
        valueType: 'number',
        label: 'Offline clock skew tolerance (minutes)',
        description: 'How far a device clock may differ from the server before a queued punch is held for a human instead of trusted.',
        effectiveFrom: new Date(),
      },
    });
  }
  const existingAge = await db.misBusinessRule.findFirst({ where: { ruleKey: OFFLINE_MAX_AGE_KEY } });
  if (!existingAge) {
    await db.misBusinessRule.create({
      data: {
        ruleKey: OFFLINE_MAX_AGE_KEY,
        ruleValue: '72',
        valueType: 'number',
        label: 'Offline queue age limit (hours)',
        description: 'A queued write older than this is held for a human rather than replayed. It is never discarded.',
        effectiveFrom: new Date(),
      },
    });
  }
}

/**
 * The offline tolerances in force now. Ungated, like getRuleValue and
 * getLineClearanceRule — the gate that matters is on changing a rule, not on
 * replaying a write against it.
 */
export async function getOfflineRules(): Promise<{ clockSkewMinutes: number; maxQueueAgeHours: number }> {
  await ensureOfflineDefaults();
  const [skewRaw, ageRaw] = await Promise.all([
    getRuleValue(OFFLINE_SKEW_KEY),
    getRuleValue(OFFLINE_MAX_AGE_KEY),
  ]);
  const skew = Number.parseInt(skewRaw ?? '', 10);
  const age = Number.parseInt(ageRaw ?? '', 10);
  return {
    clockSkewMinutes: Number.isFinite(skew) && skew > 0 ? skew : 15,
    maxQueueAgeHours: Number.isFinite(age) && age > 0 ? age : 72,
  };
}

/**
 * D22: the factory's timezone — an IANA zone, seeded `Asia/Kolkata`. Every
 * day-boundary, shift-window and attendance-day derivation resolves through this
 * and never through the server's local clock, because the database (UTC+8) and the
 * plant (IST) are 2.5 hours apart. Effective-dated like every other rule.
 */
const FACTORY_TIMEZONE_KEY = 'factory.timezone';

async function ensureFactoryDefaults() {
  const existing = await db.misBusinessRule.findFirst({ where: { ruleKey: FACTORY_TIMEZONE_KEY } });
  if (existing) return;
  await db.misBusinessRule.create({
    data: {
      ruleKey: FACTORY_TIMEZONE_KEY,
      ruleValue: DEFAULT_FACTORY_TIMEZONE,
      valueType: 'string',
      label: 'Factory timezone (IANA)',
      description:
        'The plant’s timezone, as a full IANA name like Asia/Kolkata. Decides which day a punch, a shift and a report belong to. Never an abbreviation such as IST.',
      effectiveFrom: new Date(),
    },
  });
}

/**
 * The factory's timezone in force now. Ungated, like `getOfflineRules` — the gate
 * that matters is on changing it. An unreadable or invalid stored value falls back
 * to the seeded default rather than to the server's clock: a wrong-but-named zone
 * is a bug you can see; server-local time is one you cannot.
 */
export async function getFactoryTimezone(): Promise<string> {
  await ensureFactoryDefaults();
  return resolveFactoryTimezone(await getRuleValue(FACTORY_TIMEZONE_KEY));
}

/**
 * How many days back the register may still be corrected, today included — the
 * `ATTENDANCE_CORRECTION_DAYS` rule, three when unset. Ungated: the gate that
 * matters is on changing it. Read by punch ingestion (D21) and by the Super
 * Attendance Operator's "corrections open" card, so the two can never disagree.
 */
export async function getCorrectionWindowDays(): Promise<number> {
  const parsed = Number.parseInt((await getRuleValue('ATTENDANCE_CORRECTION_DAYS')) ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

async function createRuleRevision(
  ruleKey: string,
  ruleValue: string,
  actorId: string,
  /** D12: a change that starts on a chosen day, with the reason it was made. Omitted = starts today, as before. */
  opts: { effectiveFrom?: Date; reason?: string; action?: string } = {},
) {
  const existing = await db.misBusinessRule.findFirst({ where: { ruleKey }, orderBy: { effectiveFrom: 'desc' } });
  if (!existing) throw new Error(`Rule ${ruleKey} not found`);
  // The audit "before" is the value this row REPLACES: the row in force on the day the new one starts. With an
  // upcoming row already on file the newest row is not it (2.0 in force, 1.5 due in October; a change starting in
  // September replaces 2.0, not 1.5).
  const replaced = opts.effectiveFrom
    ? (await db.misBusinessRule.findFirst({ where: { ruleKey, effectiveFrom: { lte: opts.effectiveFrom } }, orderBy: { effectiveFrom: 'desc' } })) ?? existing
    : existing;
  // D12: the start day and the reason travel with the row's audit entry — never a figure (see `after` below).
  const scheduled = {
    ...(opts.effectiveFrom ? { effectiveFrom: opts.effectiveFrom.toISOString().slice(0, 10) } : {}),
    ...(opts.reason ? { reason: opts.reason } : {}),
  };
  const rec = await db.misBusinessRule.create({
    data: {
      ruleKey,
      ruleValue,
      valueType: existing.valueType,
      label: existing.label,
      description: existing.description,
      effectiveFrom: opts.effectiveFrom ?? new Date(),
      updatedById: actorId,
    },
  });
  await logAuditEvent({
    actorId,
    action: opts.action ?? 'UPDATE_RULE',
    entity: 'MisBusinessRule',
    entityId: rec.id,
    // A wage rule's value is a wage: the audit row names WHICH rule changed and who changed it,
    // never the figure (D24, MIS_UI_SPEC §3). redact() matches property names and `ruleValue` is
    // not one, so the omission has to happen here (F-04).
    before: isWageRuleKey(ruleKey) ? { ruleKey } : { ruleKey, ruleValue: replaced.ruleValue },
    after: isWageRuleKey(ruleKey) ? { ruleKey, ...scheduled } : { ruleKey, ruleValue, ...scheduled },
  });
  return rec;
}

function isAqlRuleKey(ruleKey: string): ruleKey is AqlRuleKey {
  return (AQL_RULE_KEYS as readonly string[]).includes(ruleKey);
}

export async function getBusinessRules() {
  const actor = await requirePermission('settings.read');
  // settings.read is held by Admin; the wage rates are wage data (S9 / D24) and reach only a
  // caller who holds wages.read (F-02). Filtered here, in the query result — not in the screen.
  const mayReadWages = can(actor.role, 'wages.read');
  const rows = await db.misBusinessRule.findMany({ orderBy: [{ ruleKey: 'asc' }, { effectiveFrom: 'desc' }] });
  // Return only the latest effective value per key, and never the AQL keys —
  // those are edited from the Owner-only /mis/settings/aql screen instead.
  const seen = new Set<string>();
  return rows
    .filter((r) => !isAqlRuleKey(r.ruleKey))
    .filter((r) => mayReadWages || !isWageRuleKey(r.ruleKey))
    .filter(r => { if (seen.has(r.ruleKey)) return false; seen.add(r.ruleKey); return true; });
}

export async function updateBusinessRule(ruleKey: string, ruleValue: string) {
  const actor = await requirePermission('settings.write');
  // settings.write is held by Admin, but this editor accepts ANY key — so the key decides the real
  // gate: an AQL threshold needs aql.read (D6) and a wage rate needs wages.read (S9 / D24). Without
  // this an Admin could rewrite the rates and thresholds that the dedicated Owner-only screens
  // exist to protect (F-03).
  if (isAqlRuleKey(ruleKey)) await requirePermission('aql.read', ruleKey);
  else if (isWageRuleKey(ruleKey)) await requirePermission('wages.read', ruleKey);
  // A timezone that is not a real IANA name would silently mis-file every punch from
  // now on, so it is refused here rather than discovered in a payroll dispute (D22).
  if (ruleKey === FACTORY_TIMEZONE_KEY && !isValidTimeZone(ruleValue)) {
    throw new Error('The factory timezone must be a full IANA name such as Asia/Kolkata — not an abbreviation like IST.');
  }
  return createRuleRevision(ruleKey, ruleValue, actor.userId);
}

/**
 * Every effective-dated revision of ONE wage rule, oldest first — so payroll can price each day at
 * the rate in force on that day (F-08, D27). Owner only (wages.read, S9 / D24); the argument is
 * typed to the wage keys so this cannot become a way to read any other rule's history.
 */
export async function getWageRuleHistory(ruleKey: WageRuleKey): Promise<{ effectiveFrom: Date; ruleValue: string }[]> {
  await requirePermission('wages.read');
  if (!isWageRuleKey(ruleKey)) throw new Error(`${String(ruleKey)} is not a wage rule`);
  const rows = await db.misBusinessRule.findMany({ where: { ruleKey }, orderBy: { effectiveFrom: 'asc' } });
  return rows.map((r) => ({ effectiveFrom: r.effectiveFrom, ruleValue: r.ruleValue }));
}

export async function getRuleValue(ruleKey: string): Promise<string | null> {
  const row = await db.misBusinessRule.findFirst({
    where: { ruleKey, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: 'desc' },
  });
  return row?.ruleValue ?? null;
}

/**
 * The current line-clearance mode and cap (D7), for the precondition engine.
 * No permission gate — the same "gate the write, not the read" pattern as
 * getAqlThresholds; line-clearance.ts calls this after its own checks.
 */
export async function getLineClearanceRule(): Promise<{ mode: LineClearanceMode; maxMinutes: number | null }> {
  await ensureLineClearanceDefaults();
  const [modeRaw, capRaw] = await Promise.all([
    getRuleValue(LINE_CLEARANCE_MODE_KEY),
    getRuleValue(LINE_CLEARANCE_MAX_MINUTES_KEY),
  ]);
  const mode: LineClearanceMode = modeRaw === 'SHIFT' || modeRaw === 'MINUTES' ? modeRaw : 'JOB';
  const parsedCap = capRaw != null ? Number.parseInt(capRaw, 10) : NaN;
  const maxMinutes = Number.isFinite(parsedCap) && parsedCap > 0 ? parsedCap : null;
  return { mode, maxMinutes };
}

/** The Owner-only AQL threshold rows, for the dedicated settings screen. */
export async function getAqlThresholdRules() {
  await requirePermission('aql.read');
  await ensureAqlDefaults();
  const rows = await db.misBusinessRule.findMany({
    where: { ruleKey: { in: [...AQL_RULE_KEYS] } },
    orderBy: [{ ruleKey: 'asc' }, { effectiveFrom: 'desc' }],
  });
  const seen = new Set<string>();
  return rows.filter(r => { if (seen.has(r.ruleKey)) return false; seen.add(r.ruleKey); return true; });
}

export async function updateAqlThreshold(ruleKey: string, ruleValue: string) {
  const actor = await requirePermission('aql.read');
  if (!isAqlRuleKey(ruleKey)) throw new Error(`${ruleKey} is not an AQL threshold`);
  return createRuleRevision(ruleKey, ruleValue, actor.userId);
}

/**
 * The current AQL thresholds, for the engine to score a sample against.
 *
 * No permission gate: this is an internal read used by `qc.ts` after its own
 * `qc.write` check, the same way `getRuleValue` is used unguarded elsewhere —
 * the gate that matters is on *changing* a threshold, not on scoring with it.
 */
export async function getAqlThresholds(): Promise<AqlThresholds> {
  await ensureAqlDefaults();
  const [sampleSize, criticalMax, majorMax, minorMax] = await Promise.all(
    AQL_RULE_KEYS.map((key) => getRuleValue(key)),
  );
  return {
    sampleSize: Number(sampleSize ?? AQL_DEFAULTS.AQL_SAMPLE_SIZE.value),
    criticalMax: Number(criticalMax ?? AQL_DEFAULTS.AQL_CRITICAL_MAX.value),
    majorMax: Number(majorMax ?? AQL_DEFAULTS.AQL_MAJOR_MAX.value),
    minorMax: Number(minorMax ?? AQL_DEFAULTS.AQL_MINOR_MAX.value),
  };
}


/**
 * D12: schedule a change to ANY business rule — a new row with a start date and a REASON. Nothing is edited or
 * deleted: the old row keeps its range, a wrong value is corrected by adding another row, and both stay on the
 * record. Owner only (`wages.read` is the Owner's marker, D24/D25): this screen reaches wage rates and AQL
 * limits, which is what payroll pays and what QC accepts.
 *
 * The day is the FACTORY's (D22) and may not be in the past. A second row on the same day is refused — the
 * `(key, effectiveFrom)` constraint says so anyway, this says it in words. Every change writes an audit row
 * (`SCHEDULE_RULE`) carrying the reason; a wage rule's audit still names the key, never the figure (F-04).
 */
export async function scheduleBusinessRule(input: { ruleKey: string; ruleValue: string; effectiveFrom: string; reason: string }) {
  const actor = await requirePermission('wages.read', input.ruleKey);
  const timeZone = await getFactoryTimezone();
  const todayKey = factoryDateKey(new Date(), timeZone);

  const rows = await db.misBusinessRule.findMany({ where: { ruleKey: input.ruleKey }, select: { effectiveFrom: true, valueType: true } });
  if (rows.length === 0) throw new Error(`Rule ${input.ruleKey} not found`);
  const error = validateSchedule({
    ruleKey: input.ruleKey,
    value: input.ruleValue,
    valueType: rows[0].valueType,
    effectiveFrom: input.effectiveFrom,
    reason: input.reason,
    todayKey,
    existingDays: rows.map((r) => dbDateKey(r.effectiveFrom)),
  });
  if (error) throw new Error(error);
  // A timezone that is not a real IANA name would silently mis-file every punch from then on (D22).
  if (input.ruleKey === FACTORY_TIMEZONE_KEY && !isValidTimeZone(input.ruleValue)) {
    throw new Error('The factory timezone must be a full IANA name such as Asia/Kolkata — not an abbreviation like IST.');
  }
  try {
    return await createRuleRevision(input.ruleKey, input.ruleValue.trim(), actor.userId, {
      effectiveFrom: dateKeyToDbDate(input.effectiveFrom),
      reason: input.reason.trim(),
      action: 'SCHEDULE_RULE',
    });
  } catch (error) {
    // Two people scheduling the same day at once: the (ruleKey, effectiveFrom) constraint wins. Say what happened
    // in words — never the table and constraint names a raw database error carries.
    if ((error as { code?: unknown } | null)?.code === 'P2002') throw new Error('A row for this rule already starts on that day. Nothing is edited — pick another day.');
    throw error;
  }
}
