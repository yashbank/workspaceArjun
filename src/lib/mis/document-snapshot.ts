/**
 * R2-46 follow-up — the frozen content of a controlled document version (COA, job card). Pure: no
 * Prisma, no React.
 *
 * A snapshot is exactly the data the print page renders, captured from the live reads when a version
 * is issued and frozen when it is approved. An APPROVED version prints from its snapshot, so a
 * reprint is identical even if the order, QC checks or production data change later. Dates are ISO
 * strings (the snapshot is stored as JSON). Names and codes only — never a rate or a wage.
 */
import type { DocVersionType } from './document-version';

export const SNAPSHOT_SCHEMA = 1;

type DateLike = Date | string | null | undefined;
const iso = (v: DateLike): string | null => (v == null ? null : new Date(v).toISOString());

export type SnapshotOrder = {
  orderNumber: string;
  status: string | null;
  customerName: string | null;
  description: string | null;
  deliveryDate: string | null;
  notes: string | null;
  /** R2-264 / R2-265: optional so a snapshot frozen before these fields existed still parses. */
  quantity?: number | null;
  unit?: string | null;
  customerPoRef?: string | null;
};

export type CoaQcRow = {
  id: string;
  bomStageId: string | null;
  parameterName: string | null;
  result: string;
  defectType: string | null;
  notes: string | null;
  checkTime: string;
  checkByName: string | null;
};

export type CoaSnapshot = {
  kind: 'COA';
  schema: number;
  capturedAt: string;
  order: SnapshotOrder;
  qcLogs: CoaQcRow[];
  /** R2-316: when production finished (last production entry); optional so older frozen copies still parse. */
  mfgDate?: string | null;
};

export type JobCardSnapshot = {
  kind: 'JOB_CARD';
  schema: number;
  capturedAt: string;
  order: SnapshotOrder;
  bomStages: {
    id: string;
    stageName: string;
    processName: string | null;
    materials: { id: string; description: string | null; quantity: number; unit: string | null }[];
  }[];
  production: { entries: number; byUnit: { unit: string; produced: number; waste: number }[] };
  phases: {
    id: string;
    sequence: number;
    status: string;
    processName: string;
    notApplicableReason: string | null;
    downstreamFlagged: boolean;
    inChargeName: string | null;
    startedAt: string | null;
    signedOffAt: string | null;
  }[];
  crew: {
    jobPhaseId: string | null;
    machineName: string;
    dateKey: string;
    shiftName: string | null;
    people: { name: string; employeeCode: string; released: boolean }[];
  }[];
};

export type DocSnapshot = CoaSnapshot | JobCardSnapshot;

// Loose structural inputs: the live reads' rows, as the print pages consume them.
export type OrderInput = {
  orderNumber: string;
  status?: string | null;
  description?: string | null;
  deliveryDate?: DateLike;
  notes?: string | null;
  customer?: { name: string | null } | null;
  quantity?: { toNumber(): number } | number | string | null;
  unit?: string | null;
  customerPoRef?: string | null;
};
export type QcInput = {
  id: string;
  bomStageId?: string | null;
  parameterName: string | null;
  result: string;
  defectType: string | null;
  notes: string | null;
  checkTime: Date | string;
  checkBy: { name: string | null } | null;
};
export type BomInput = {
  stages: {
    id: string;
    stageName: string;
    process?: { name: string } | null;
    materials: { id: string; description?: string | null; quantity: unknown; unit?: string | null }[];
  }[];
} | null;
export type ProductionInput = {
  totalProduced: unknown;
  totalWaste: unknown;
  entries: number;
  byUnit?: { unit: string; produced: number; waste: number }[] | null;
};
export type PhaseInput = {
  id: string;
  sequence: number;
  status: string;
  process: { name: string };
  notApplicableReason?: string | null;
  downstreamFlagged?: boolean | null;
  inCharge?: { name: string | null } | null;
  startedAt?: DateLike;
  signedOffAt?: DateLike;
};
export type CrewInput = {
  jobPhaseId: string | null;
  machineName: string;
  dateKey: string;
  shiftName: string | null;
  people: { name: string; employeeCode: string; released: boolean }[];
};

function snapshotOrder(o: OrderInput): SnapshotOrder {
  return {
    orderNumber: o.orderNumber,
    status: o.status ?? null,
    customerName: o.customer?.name ?? null,
    description: o.description ?? null,
    deliveryDate: iso(o.deliveryDate),
    notes: o.notes ?? null,
    quantity: o.quantity == null ? null : Number(typeof o.quantity === 'object' ? o.quantity.toNumber() : o.quantity),
    unit: o.unit ?? null,
    customerPoRef: o.customerPoRef ?? null,
  };
}

export function coaSnapshotFrom(order: OrderInput, qcLogs: readonly QcInput[], at: Date, extras: { mfgDate?: Date | string | null } = {}): CoaSnapshot {
  return {
    kind: 'COA',
    schema: SNAPSHOT_SCHEMA,
    capturedAt: at.toISOString(),
    order: snapshotOrder(order),
    mfgDate: iso(extras.mfgDate),
    qcLogs: qcLogs.map((q) => ({
      id: q.id,
      bomStageId: q.bomStageId ?? null,
      parameterName: q.parameterName ?? null,
      result: q.result,
      defectType: q.defectType ?? null,
      notes: q.notes ?? null,
      checkTime: new Date(q.checkTime).toISOString(),
      checkByName: q.checkBy?.name ?? null,
    })),
  };
}

export function jobCardSnapshotFrom(
  i: { order: OrderInput; bom: BomInput; production: ProductionInput; phases: readonly PhaseInput[]; crew: readonly CrewInput[] },
  at: Date,
): JobCardSnapshot {
  // R3 B124: per-unit totals, never one mixed sum; an old summary with no byUnit keeps its single total.
  const byUnit =
    i.production.byUnit && i.production.byUnit.length > 0
      ? i.production.byUnit.map((u) => ({ unit: u.unit, produced: Number(u.produced), waste: Number(u.waste) }))
      : [{ unit: '', produced: Number(i.production.totalProduced), waste: Number(i.production.totalWaste) }];
  return {
    kind: 'JOB_CARD',
    schema: SNAPSHOT_SCHEMA,
    capturedAt: at.toISOString(),
    order: snapshotOrder(i.order),
    bomStages: (i.bom?.stages ?? []).map((s) => ({
      id: s.id,
      stageName: s.stageName,
      processName: s.process?.name ?? null,
      materials: s.materials.map((m) => ({ id: m.id, description: m.description ?? null, quantity: Number(m.quantity), unit: m.unit ?? null })),
    })),
    production: { entries: i.production.entries, byUnit },
    phases: i.phases.map((p) => ({
      id: p.id,
      sequence: p.sequence,
      status: p.status,
      processName: p.process.name,
      notApplicableReason: p.notApplicableReason ?? null,
      downstreamFlagged: Boolean(p.downstreamFlagged),
      inChargeName: p.inCharge?.name ?? null,
      startedAt: iso(p.startedAt),
      signedOffAt: iso(p.signedOffAt),
    })),
    crew: i.crew.map((g) => ({
      jobPhaseId: g.jobPhaseId,
      machineName: g.machineName,
      dateKey: g.dateKey,
      shiftName: g.shiftName,
      people: g.people.map((p) => ({ name: p.name, employeeCode: p.employeeCode, released: p.released })),
    })),
  };
}

/** R2-160: a stored frozen copy that cannot be read. The print pages catch this one and show an inline alert. */
export class SnapshotUnreadableError extends Error {
  constructor() {
    super('The stored copy of this version cannot be read. Do not print it.');
    this.name = 'SnapshotUnreadableError';
  }
}

/**
 * The stored JSON as a snapshot of `type`, or null when it is absent, of another type, or not a
 * shape this code can print (a corrupt row must not print as if it were the frozen copy).
 */
export function parseSnapshot<T extends DocVersionType>(json: unknown, type: T): (T extends 'COA' ? CoaSnapshot : JobCardSnapshot) | null {
  if (!json || typeof json !== 'object') return null;
  const s = json as Record<string, unknown>;
  if (s.kind !== type || typeof s.capturedAt !== 'string' || !s.order || typeof s.order !== 'object') return null;
  if (type === 'COA' && !Array.isArray(s.qcLogs)) return null;
  if (type === 'JOB_CARD' && (!Array.isArray(s.bomStages) || !Array.isArray(s.phases) || !Array.isArray(s.crew) || !s.production)) return null;
  return json as T extends 'COA' ? CoaSnapshot : JobCardSnapshot;
}

/** Same document content? (`capturedAt` ignored.) Used to note on approval whether data moved since issue. */
export function sameSnapshotContent(a: DocSnapshot | null, b: DocSnapshot | null): boolean {
  if (!a || !b) return false;
  const strip = ({ capturedAt: _c, ...rest }: DocSnapshot) => JSON.stringify(rest);
  return strip(a) === strip(b);
}

/** Where the printed body comes from, for the version strip's note. */
export type DocDataSource = 'SNAPSHOT' | 'LIVE' | 'LIVE_NO_SNAPSHOT';

/** An APPROVED version prints its snapshot; a legacy APPROVED row (no snapshot) and any PREPARED/unissued doc print live. */
export function docDataSource(selected: { status: string; hasSnapshot?: boolean } | null): DocDataSource {
  if (!selected || selected.status !== 'APPROVED') return 'LIVE';
  return selected.hasSnapshot ? 'SNAPSHOT' : 'LIVE_NO_SNAPSHOT';
}

/** `?v=3` → 3; anything else → null (the page then shows the latest version). */
export function parseVersionParam(v: string | string[] | undefined): number | null {
  const raw = Array.isArray(v) ? v[0] : v;
  if (!raw || !/^\d{1,6}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}
