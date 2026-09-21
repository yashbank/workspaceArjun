/**
 * The pieces of D11's traceability screen that are logic rather than layout.
 *
 * D11's rules, each a function here so it is tested and not read off a picture:
 *
 * - **A gap is drawn as a gap.** Every step of the chain is `ok` (recorded), `none` (nothing is recorded for
 *   it — dashed, an absence of data) or `denied` (recorded, but this role may not see that table). A step is
 *   never left out, so a reader cannot assume the chain simply ended (`Section`).
 * - **Every hop names a person and a time** — or says it does not (`by: null`), never a blank that looks like "nobody".
 * - **The log is read-only and time-ordered** (`buildEvents`): newest first, built only from rows that exist.
 * - **A failure carries its clearance** (`summariseQc`): cleared only by a LATER PASS on the same stage and
 *   parameter — derived, never stored (MIS-163).
 * - **No verdict the data cannot support.** The artboard's "Contained" needs a despatch record and lot-level
 *   issue records; neither exists, so nothing here computes one (see F-21).
 * - **Time is the factory's** (D22): every stamp is formatted in the factory zone, never the server's.
 *
 * Pure: no Prisma, no React.
 */

import { factoryDateKey, formatFactoryTime } from './factory-time';

export type Section<T> = { state: 'ok'; data: T } | { state: 'none' } | { state: 'denied' };

export const ok = <T>(data: T): Section<T> => ({ state: 'ok', data });
export const none = <T>(): Section<T> => ({ state: 'none' });
export const denied = <T>(): Section<T> => ({ state: 'denied' });

/** A section with an empty list is "nothing recorded", not an empty table that looks like a result. */
export function okOrNone<T>(rows: readonly T[]): Section<T[]> {
  return rows.length === 0 ? none() : ok([...rows]);
}

export const MAX_QUERY = 60;

/** The search text: a string, trimmed, capped. Anything else is "no search". */
export function normaliseQuery(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_QUERY) : '';
}

/** `06/09 11:20` on the factory's clock; with the year when it is not the same year as `now`. */
export function stamp(at: Date, timeZone: string, now?: Date): string {
  const key = factoryDateKey(at, timeZone);
  const year = now && factoryDateKey(now, timeZone).slice(0, 4) !== key.slice(0, 4) ? `/${key.slice(0, 4)}` : '';
  return `${key.slice(8, 10)}/${key.slice(5, 7)}${year} ${formatFactoryTime(at, timeZone)}`;
}

export function stampDate(at: Date, timeZone: string): string {
  const key = factoryDateKey(at, timeZone);
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
}

export type TraceEventKind = 'ORDER_RAISED' | 'RECEIVED' | 'ISSUED' | 'PHASE_STARTED' | 'PHASE_SIGNED' | 'QC_FAILED' | 'QC_CLEARED';

export type TraceEventInput = { at: Date; kind: TraceEventKind; subject: string; qty?: number | null; unit?: string | null; by: string | null };
export type TraceEvent = { atIso: string; atLabel: string; kind: TraceEventKind; subject: string; qty: number | null; unit: string | null; by: string | null };

/** Newest first; a tie keeps its input order so the log never reshuffles between two loads. */
export function buildEvents(events: readonly TraceEventInput[], timeZone: string, now?: Date): TraceEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.at.getTime() - a.e.at.getTime() || a.i - b.i)
    .map(({ e }) => ({ atIso: e.at.toISOString(), atLabel: stamp(e.at, timeZone, now), kind: e.kind, subject: e.subject, qty: e.qty ?? null, unit: e.unit ?? null, by: e.by }));
}

export type QcRow = {
  id: string;
  bomStageId: string | null;
  parameterName: string | null;
  result: string;
  defectType: string | null;
  checkTime: Date;
  by: string | null;
};

export type QcFailure = { id: string; parameter: string; atLabel: string; defectType: string | null; by: string | null; cleared: string | null; clearedBy: string | null };
export type QcSummary = { taken: number; pass: number; fail: number; makeready: number; failures: QcFailure[] };

export function summariseQc(checks: readonly QcRow[], timeZone: string, now?: Date): QcSummary {
  const sameKey = (a: QcRow, b: QcRow) => a.bomStageId === b.bomStageId && (a.parameterName ?? 'General') === (b.parameterName ?? 'General');
  const failures: QcFailure[] = checks
    .filter((c) => c.result === 'FAIL')
    .sort((a, b) => a.checkTime.getTime() - b.checkTime.getTime())
    .map((f) => {
      const later = checks
        .filter((c) => c.result === 'PASS' && sameKey(c, f) && c.checkTime.getTime() > f.checkTime.getTime())
        .sort((a, b) => a.checkTime.getTime() - b.checkTime.getTime())[0];
      return {
        id: f.id,
        parameter: f.parameterName ?? 'General',
        atLabel: stamp(f.checkTime, timeZone, now),
        defectType: f.defectType,
        by: f.by,
        cleared: later ? stamp(later.checkTime, timeZone, now) : null,
        clearedBy: later ? later.by : null,
      };
    });
  return {
    taken: checks.length,
    pass: checks.filter((c) => c.result === 'PASS').length,
    fail: failures.length,
    makeready: checks.filter((c) => c.result !== 'PASS' && c.result !== 'FAIL').length,
    failures,
  };
}

/** How the ledger's rows and the store transactions pair up: same item, same quantity, within seconds. */
export function pairIssuer<T extends { itemId: string; quantity: number; at: Date; by: string | null }>(
  ledger: { itemId: string; quantity: number; at: Date },
  txns: readonly T[],
  used: Set<number> = new Set(),
  toleranceMs = 10_000,
): string | null {
  const at = txns.findIndex((t, i) => !used.has(i) && t.itemId === ledger.itemId && Math.abs(t.quantity - ledger.quantity) < 0.005 && Math.abs(t.at.getTime() - ledger.at.getTime()) <= toleranceMs);
  if (at < 0) return null;
  // Each store transaction names ONE issue: two identical issues seconds apart must not share a person.
  used.add(at);
  return txns[at].by;
}

/** The name `withCheckerNames` gives a checker it cannot resolve is a dash; that is "not recorded", not a name. */
export function personOrNull(name: string | null | undefined): string | null {
  const n = (name ?? '').trim();
  return n === '' || n === '—' ? null : n;
}

/** Quantities as people write them: `1,240`, `24.8`. */
export function qtyLabel(n: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

// ---------------------------------------------------------------------------
// What the screen is handed
// ---------------------------------------------------------------------------

export type OrderFacts = {
  id: string;
  orderNumber: string;
  description: string | null;
  customer: string | null;
  status: string;
  raisedLabel: string;
  raisedBy: string | null;
  deliveryLabel: string | null;
};

export type ReceiptFact = { grnNumber: string; batchNo: string | null; qty: number; unit: string; receivedLabel: string; by: string | null };
export type MaterialItem = { name: string; unit: string; receipts: ReceiptFact[] };
export type IssueFact = { itemName: string; unit: string; qty: number; atLabel: string; by: string | null; overIssue: boolean };
export type PhaseFact = { seq: number; name: string; status: string; inCharge: string | null; startedLabel: string | null; startedBy: string | null; signedLabel: string | null; signedBy: string | null };

export type LotReceipt = { grnNumber: string; poNumber: string | null; supplier: string | null; itemName: string; unit: string; qty: number; receivedLabel: string | null; by: string | null };
export type LotIssuedTo = { orderNumber: string; orderId: string | null; qty: number; atLabel: string };
export type LotFacts = { batchNo: string; receipts: LotReceipt[]; issuedAfter: Section<{ itemName: string; unit: string; orders: LotIssuedTo[] }[]> };

export type TraceView = {
  query: string;
  mode: 'idle' | 'order' | 'lot' | 'none';
  /** The search looked like a lot but this role may not read receipts. */
  lotDenied: boolean;
  order: OrderFacts | null;
  lot: LotFacts | null;
  material: Section<MaterialItem[]>;
  issues: Section<IssueFact[]>;
  phases: Section<{ done: number; total: number; rows: PhaseFact[] }>;
  qc: Section<QcSummary>;
  despatch: { status: string };
  events: TraceEvent[];
};

export const EMPTY_TRACE = (query: string, mode: TraceView['mode'], lotDenied = false): TraceView => ({
  query, mode, lotDenied, order: null, lot: null, material: none(), issues: none(), phases: none(), qc: none(), despatch: { status: '' }, events: [],
});
