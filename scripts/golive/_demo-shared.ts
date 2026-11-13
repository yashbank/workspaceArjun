/** Shared by seed-demo.ts and cleanup-demo.ts: the table registry (creation order) and the id manifest. */
import fs from 'node:fs';
import path from 'node:path';

/** Prisma delegate names in CREATION order. Cleanup deletes in the reverse of this order. */
export const DEMO_TABLES = [
  'misShift',
  'misCustomer',
  'misSupplier',
  'misItem',
  'misMachine',
  'misInventoryLedger',
  'misStoreTransaction',
  'misPurchaseOrder',
  'misPoItem',
  'misGrn',
  'misGrnItem',
  'misSupplierInvoice',
  'misOrder',
  'misOrderStockAllocation',
  'misBom',
  'misBomStage',
  'misBomMaterial',
  'misJobPhase',
  'misMachineAllocation',
  'misWorkerAllocation',
  'misProductionLog',
  'misQcCheck',
  'misAttendance',
  'misPunchRegularization',
  'misPayrollPeriod',
] as const;
export type DemoTable = (typeof DEMO_TABLES)[number];

/** Tables with an `updated_at` column: the seeder records its value after commit so cleanup can report later edits. */
export const STAMPED_TABLES: readonly DemoTable[] = [
  'misShift', 'misCustomer', 'misSupplier', 'misItem', 'misMachine', 'misPurchaseOrder', 'misGrn', 'misOrder',
  'misBom', 'misJobPhase', 'misAttendance', 'misPunchRegularization', 'misPayrollPeriod',
];

export type ManifestChunk = {
  name: string;
  /** `pending` is written BEFORE the transaction opens; rows may or may not exist. `committed` after. */
  state: 'pending' | 'committed';
  ids: Partial<Record<DemoTable, string[]>>;
};

export type DemoManifest = {
  version: 1;
  runId: string;
  createdAt: string;
  projectRef: string;
  chunks: ManifestChunk[];
  /** row id -> updatedAt ISO right after commit (tables in STAMPED_TABLES). */
  stamps: Record<string, string>;
};

export const MANIFEST_PATH = path.join(__dirname, '..', '..', 'data', 'golive', 'demo-ids.json');

export function readManifest(): DemoManifest | null {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as DemoManifest;
}

export function writeManifest(m: DemoManifest): void {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  const tmp = `${MANIFEST_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, MANIFEST_PATH);
}

/** All manifest ids for one table across chunks. */
export function idsFor(m: DemoManifest, table: DemoTable): string[] {
  return m.chunks.flatMap((c) => c.ids[table] ?? []);
}

/** Minimal shape of a Prisma delegate, so the registry can be driven generically without `any`. */
export type Delegate = {
  createMany: (a: { data: unknown[] }) => Promise<{ count: number }>;
  create: (a: { data: unknown }) => Promise<unknown>;
  findMany: (a: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  count: (a?: Record<string, unknown>) => Promise<number>;
  deleteMany: (a: { where: Record<string, unknown> }) => Promise<{ count: number }>;
};

export function delegate(client: unknown, table: string): Delegate {
  return (client as Record<string, Delegate>)[table];
}
