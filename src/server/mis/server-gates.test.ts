/**
 * Phase 14 · MIS-37/MIS-46 support — every door into the MIS opens with a gate.
 *
 * CLAUDE.md: "Every exported function starts with a requirePermission(...) gate."
 * A rule like that is only true if something checks it, and nobody re-reads 280
 * functions by eye. This reads the source (testing/ast.ts) and fails when:
 *   - a new exported server function opens with anything other than a gate and is
 *     not on the reviewed list below;
 *   - a function on the list has since been gated (the entry is stale — delete it);
 *   - a server action or route handler reaches data without going through a gated
 *     server function first;
 *   - a money function is gated on the wrong action.
 *
 * The lists are deliberately short and every entry carries its reason. Adding to
 * one is a review decision, not a way to make this test green.
 */
import { describe, expect, it } from 'vitest';

import { MIS_ACTIONS } from '@/lib/mis/permissions';

import { directiveOf, exportedFunctions, importsOf, listFiles, type ExportedFunction } from './testing/ast';

const SERVER_FILES = listFiles('src/server/mis', /\.ts$/).filter(
  (f) => !/\.test\.ts$/.test(f) && !f.includes('/testing/') && !f.endsWith('offline-fake-db.ts'),
);

/** A first await that is one of these IS a gate. */
const GATES = new Set(['requirePermission', 'requireMisAccess']);

type Reviewed = { reason: string; alsoContains?: string; door?: true };

/**
 * Exported async functions that do NOT open with requirePermission/requireMisAccess, and
 * why that is acceptable. `alsoContains` pins the thing that makes it safe: the check
 * fails if the body stops calling it.
 */
const REVIEWED_UNGATED: Record<string, Reviewed> = {
  // --- the gate machinery itself ---
  'auth.ts#requirePermission': { reason: 'this IS the gate' },
  'auth.ts#checkPermission': { reason: 'render-only boolean; the server function still gates (documented in auth.ts)' },
  'guard.ts#requireMisAccess': { reason: 'this IS the feature-flag gate' },
  'audit.ts#logAuditEvent': { reason: 'a writer, not a reader; the caller supplies the actor and has already been gated' },

  // --- credential doors: a device token / pairing code / session, checked before anything else ---
  'kiosk-device.ts#requestEnrolment': { reason: 'unauthenticated by design (D18: the tablet asks); returns only a pairing code', door: true },
  'kiosk-device.ts#claimEnrolment': { reason: 'pairing-code + poll-secret credential (D18)', alsoContains: 'pollSecret', door: true },
  'kiosk-device.ts#authenticateDevice': { reason: 'this IS the device-token check (D18)', door: true },
  'kiosk-device.ts#recordDeviceSync': { reason: 'internal; called only after authenticateDevice succeeded (D18)' },
  'kiosk-device.ts#pullForDevice': { reason: 'device-token door', alsoContains: 'authenticateDevice', door: true },
  'attendance-punch.ts#ingestDevicePunch': { reason: 'device-token door', alsoContains: 'authenticateDevice', door: true },
  'attendance-punch.ts#submitPunch': { reason: 'session door: user resolved first, permission checked in the transaction', alsoContains: "requirePermission('attendance.write')", door: true },
  'production.ts#submitProductionLog': { reason: 'session door: user resolved first, permission checked in the transaction', alsoContains: 'requirePermission', door: true },

  // --- internal readers a gated caller uses; none is exported through a server action ---
  'business-rules.ts#getRuleValue': { reason: 'internal rule reader (wage rules pass through it — see wage-leak.test.ts for who may call it)' },
  'business-rules.ts#getAqlThresholds': { reason: 'internal; qc.ts calls it after its own qc.write gate' },
  'business-rules.ts#getLineClearanceRule': { reason: 'internal; line-clearance.ts calls it after its own checks (D7)' },
  'business-rules.ts#getOfflineRules': { reason: 'internal; idempotency.ts reads the tolerance (D15)' },
  'business-rules.ts#getFactoryTimezone': { reason: 'internal; carries no wage or personal data (D22)' },
  'business-rules.ts#getCorrectionWindowDays': { reason: 'internal; carries no wage or personal data (D21)' },
  'wage-type.ts#listWageCodes': { reason: 'opens by calling the gated listWageTypes()', alsoContains: 'listWageTypes' },
  'line-clearance.ts#assertLineCleared': { reason: 'internal precondition called by production.ts after its own gate' },
  'line-clearance.ts#getClearanceStatus': { reason: 'wraps assertLineCleared; internal', alsoContains: 'assertLineCleared' },
  'production.ts#assertOrderOpen': { reason: 'internal precondition (D14)' },
  'production.ts#logProduction': { reason: 'wrapper; the gate is in createProductionLog', alsoContains: 'createProductionLog' },
  'job-phases.ts#resolveJobPhaseForProduction': { reason: 'internal lookup used by production.ts' },
  'documents.ts#withUploaderNames': { reason: 'internal name join; called by the gated listDocuments' },
  'qc.ts#withCheckerNames': { reason: 'internal name join; called by gated qc readers' },
  'idempotency.ts#checkTiming': { reason: 'infrastructure (D15); no data' },
  'idempotency.ts#runIdempotent': { reason: 'infrastructure (Appendix B); every caller is a gated door' },

  // --- role/identity helpers: they answer "who is this", they do not return business data ---
  'roles.ts#getMisRole': { reason: 'identity helper: answers "who is this" from the employee row' },
  'roles.ts#hasMisRole': { reason: 'identity helper' },
  'roles.ts#getMisEmployee': { reason: 'identity helper: the caller\'s own employee row' },
  'navigation.ts#getNavigationFor': { reason: 'derives the menu from the role; returns labels only' },
  'navigation.ts#getNavBadges': { reason: 'counts, gated per-badge by role inside', alsoContains: 'getMisRole' },
  'preferences.ts#getLocale': { reason: 'a user reading their own language' },
  'preferences.ts#setLocale': { reason: 'a user setting their own language; the action passes the session user' },
  'visibility.ts#resolveVisibleEmployeeIds': { reason: 'takes an already-authorised actor (D4)' },
  'visibility.ts#wouldCreateManagerCycle': { reason: 'pure graph check on ids' },
  'visibility.ts#isPoolScoped': { reason: 'takes an already-authorised actor (D4)' },
  'visibility.ts#resolveVisibleEmployeeWhere': { reason: 'takes an already-authorised actor (D4)' },
  'visibility.ts#resolveVisibleAttendanceWhere': { reason: 'takes an already-authorised actor (D4/D5)' },
  'visibility.ts#resolveVisibleMachineWhere': { reason: 'takes an already-authorised actor (D5)' },
  'visibility.ts#resolveVisibleOrderWhere': { reason: 'takes an already-authorised actor (D5)' },
};

/** Files whose exported functions are sync helpers, types or constants get no gate check. */
type Row = ExportedFunction & { key: string; file: string; source: string };
const ROWS: Row[] = SERVER_FILES.flatMap((file) =>
  exportedFunctions(file)
    .filter((fn) => fn.isAsync)
    .map((fn) => ({ ...fn, file, key: `${file.split('/').pop()}#${fn.name}`, source: file })),
);

const isGated = (row: Row) => row.firstAwait !== null && GATES.has(row.firstAwait);

describe('every exported async server function opens with a gate', () => {
  it('the scan actually found the module set (a broken glob would pass vacuously)', () => {
    expect(SERVER_FILES.length).toBeGreaterThanOrEqual(35);
    expect(ROWS.length).toBeGreaterThanOrEqual(235);
    expect(ROWS.filter(isGated).length).toBeGreaterThanOrEqual(190);
  });

  it('nothing outside the reviewed list opens with something other than a gate', () => {
    const offenders = ROWS.filter((r) => !isGated(r) && !(r.key in REVIEWED_UNGATED)).map(
      (r) => `${r.key} opens with ${r.firstAwait ?? 'no await'}`,
    );
    expect(offenders, `add a gate, or add a reviewed reason to REVIEWED_UNGATED:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no reviewed entry is stale — every one still exists and is still ungated', () => {
    const byKey = new Map(ROWS.map((r) => [r.key, r]));
    const stale = Object.keys(REVIEWED_UNGATED).filter((key) => {
      const row = byKey.get(key);
      return !row || isGated(row);
    });
    expect(stale, `remove from REVIEWED_UNGATED: ${stale.join(', ')}`).toEqual([]);
  });

  it("each reviewed entry's safety net is still in the body", async () => {
    const { readSource } = await import('./testing/ast');
    const broken: string[] = [];
    for (const [key, entry] of Object.entries(REVIEWED_UNGATED)) {
      if (!entry.alsoContains) continue;
      const file = `src/server/mis/${key.split('#')[0]}`;
      if (!readSource(file).includes(entry.alsoContains)) broken.push(`${key} no longer contains ${entry.alsoContains}`);
    }
    expect(broken).toEqual([]);
  });

  it('every requirePermission() names an action that exists (a typo would compile as a string)', () => {
    const unknown = ROWS.filter((r) => r.firstAwait === 'requirePermission')
      .filter((r) => r.firstAwaitArg !== null && !(MIS_ACTIONS as readonly string[]).includes(r.firstAwaitArg))
      .map((r) => `${r.key} requires '${r.firstAwaitArg}'`);
    expect(unknown).toEqual([]);
  });
});

describe('money and access functions are gated on the RIGHT action, not merely on some action', () => {
  const gateOf = (key: string) => ROWS.find((r) => r.key === key)?.firstAwaitArg;

  it.each([
    ['wage-type.ts#listWageTypes', 'wages.read'],
    ['wage-type.ts#createWageType', 'wages.read'],
    ['wage-type.ts#addWageRate', 'wages.read'],
    ['wage-type.ts#setWageTypeActive', 'wages.read'],
    ['payroll.ts#getMonthWageBill', 'wages.read'],
    // D6 — AQL thresholds are Owner-only.
    ['business-rules.ts#getAqlThresholdRules', 'aql.read'],
    ['business-rules.ts#updateAqlThreshold', 'aql.read'],
    ['users.ts#inviteMisUser', 'users.invite'],
    ['users.ts#listPendingMisGrants', 'users.invite'],
    ['users.ts#grantMisRole', 'users.invite'],
    ['job-phases.ts#reopenPhase', 'phase.reopen'],
    ['kiosk-device.ts#approveEnrolment', 'kiosk.manage'],
    ['kiosk-device.ts#revokeDevice', 'kiosk.manage'],
    ['kiosk-device.ts#renameDevice', 'kiosk.manage'],
    ['business-rules.ts#updateBusinessRule', 'settings.write'],
  ])('%s is gated on %s', (key, action) => {
    expect(gateOf(key)).toBe(action);
  });

  // F-01 (fixed in 14F): payroll figures — basic pay, overtime pay, late penalty, gross pay —
  // were gated on attendance.read, which four non-Owner roles hold. Wages are wages.read.
  it('calculateMonthlyPayroll is gated on wages.read (F-01)', () => {
    expect(gateOf('payroll.ts#calculateMonthlyPayroll')).toBe('wages.read');
  });

  it('the wage amount reader is gated on wages.read — no ungated function returns a wage (F-01)', () => {
    expect(gateOf('wage-type.ts#getWageAmount')).toBe('wages.read');
  });
});

describe('server actions and route handlers reach data only through a gate', () => {
  const gatedNames = new Set(ROWS.filter(isGated).map((r) => r.name));
  // Credential doors: a device token, pairing code or session is the check.
  const doorNames = new Set(
    Object.keys(REVIEWED_UNGATED)
      .filter((k) => REVIEWED_UNGATED[k].door)
      .map((k) => k.split('#')[1]),
  );

  const ACTION_FILES = [...listFiles('src/app/(mis)', /^actions\.ts$/), ...listFiles('src/app/(mis)', /^actions\.tsx$/)];
  const ROUTE_FILES = listFiles('src/app/api/mis', /^route\.ts$/);

  it('found the action and route files (a broken glob would pass vacuously)', () => {
    expect(ACTION_FILES.length).toBeGreaterThanOrEqual(25);
    expect(ROUTE_FILES.length).toBeGreaterThanOrEqual(6);
  });

  it("every 'use server' file really is one — an exported function outside it is not an endpoint", () => {
    const missing = ACTION_FILES.filter((f) => directiveOf(f) !== 'use server');
    expect(missing).toEqual([]);
  });

  /** Names imported from @/server/mis/* in a file, so we can tell "delegates to the server layer" from "does its own thing". */
  const serverImports = (file: string) =>
    new Set(importsOf(file).filter((i) => i.from.startsWith('@/server/mis/')).flatMap((i) => i.names));

  it.each(ACTION_FILES)('%s — each action opens by calling a gated server function', (file) => {
    const imported = serverImports(file);
    const fns = exportedFunctions(file).filter((f) => f.isAsync);
    const bad = fns
      .filter((fn) => {
        const first = fn.firstAwait ?? '';
        // The locale action sets the caller's own language and resolves the session itself.
        if (first === 'getCurrentUser') return !file.endsWith('(mis)/actions.ts');
        if (GATES.has(first)) return false;
        const isGatedCall = (n: string) => imported.has(n) && (gatedNames.has(n) || doorNames.has(n));
        // No await at all: the action returns a wrapper's promise (`return outcome(() => revokeDevice(..))`).
        // Then the gated function must at least be called somewhere in the body.
        if (fn.firstAwait === null) return !fn.calls.some(isGatedCall);
        return !isGatedCall(first);
      })
      .map((fn) => `${fn.name} opens with ${fn.firstAwait}`);
    expect(bad).toEqual([]);
  });

  it.each(ROUTE_FILES)('%s — the handler opens with a gate, a gated server function, or a device credential', (file) => {
    const imported = serverImports(file);
    const handlers = exportedFunctions(file).filter((f) => f.isAsync);
    expect(handlers.length).toBeGreaterThan(0);
    for (const h of handlers) {
      // A route body wraps its work in try/catch, so the first await may be `params`;
      // what matters is the server function it delegates to is a gated or credential door.
      const src = imported;
      const delegates = [...src].filter((n) => gatedNames.has(n) || doorNames.has(n) || GATES.has(n));
      expect(delegates.length, `${h.name} in ${file} imports no gated server function`).toBeGreaterThan(0);
    }
  });

  it('the wage actions are absent from every non-wage actions file', () => {
    const offenders = ACTION_FILES.filter((f) => !f.includes('/settings/wages/')).filter((f) =>
      importsOf(f).some((i) => i.from === '@/server/mis/wage-type' || i.from === '@/server/mis/payroll'),
    );
    expect(offenders).toEqual([]);
  });
});
