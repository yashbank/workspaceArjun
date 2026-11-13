/**
 * Go-live QA: remove EXACTLY the rows seed-demo.ts created (the ids in data/golive/demo-ids.json). DRY RUN by default.
 *
 *   pnpm golive:cleanup-demo                               # dry run: counts, dependants, modified rows
 *   CONFIRM_WIPE=1 pnpm golive:cleanup-demo -- --execute   # real run, one transaction PER CHUNK, newest chunk first
 *
 * Only manifest ids are ever deleted; nothing is matched by tag alone (a tag scan is REPORTED for orphans, never acted on).
 * REFUSES (reports, deletes nothing) when a row outside the manifest still depends on a demo row (for example a store
 * issue or production log a tester created against a demo item/order), or when real kiosk punches exist for a demo
 * attendance employee since the seed. Demo rows edited after the seed are reported as warnings; they are still removed.
 * Punches are never touched (immutable table): the seeder wrote none.
 */
import fs from 'node:fs';
import { openDb } from './_gate';
import { DEMO_TABLES, MANIFEST_PATH, STAMPED_TABLES, delegate, idsFor, readManifest, type DemoTable } from './_demo-shared';

/** parent table -> a child table/column that may reference it. A child that is itself in the manifest is excluded by id. */
const DEPENDANTS: { parent: DemoTable; child: string; fk: string }[] = [
  ...['misInventoryLedger', 'misStoreTransaction', 'misPoItem', 'misBomMaterial', 'misOrderStockAllocation', 'misPickListLine', 'misMaterialRequestLine', 'misStoreReturn', 'misPhysicalCount', 'misQuarantineStock']
    .map((child) => ({ parent: 'misItem' as DemoTable, child, fk: 'itemId' })),
  { parent: 'misCustomer', child: 'misOrder', fk: 'customerId' },
  { parent: 'misSupplier', child: 'misPurchaseOrder', fk: 'supplierId' },
  { parent: 'misSupplier', child: 'misSupplierInvoice', fk: 'supplierId' },
  { parent: 'misSupplier', child: 'misQuarantineStock', fk: 'supplierId' },
  { parent: 'misPurchaseOrder', child: 'misGrn', fk: 'poId' },
  { parent: 'misPurchaseOrder', child: 'misSupplierInvoice', fk: 'poId' },
  { parent: 'misPurchaseOrder', child: 'misPoItem', fk: 'poId' },
  { parent: 'misPoItem', child: 'misGrnItem', fk: 'poItemId' },
  { parent: 'misGrn', child: 'misGrnItem', fk: 'grnId' },
  { parent: 'misGrn', child: 'misQuarantineStock', fk: 'grnId' },
  { parent: 'misGrn', child: 'misSupplierInvoice', fk: 'grnId' },
  ...['misProductionLog', 'misQcCheck', 'misMachineAllocation', 'misLineClearance', 'misJobPhase', 'misMaterialRequest', 'misDocument', 'misOrderStockAllocation', 'misStoreReturn', 'misBom']
    .map((child) => ({ parent: 'misOrder' as DemoTable, child, fk: 'orderId' })),
  { parent: 'misBom', child: 'misBomStage', fk: 'bomId' },
  ...['misBomMaterial'].map((child) => ({ parent: 'misBomStage' as DemoTable, child, fk: 'stageId' })),
  ...['misProductionLog', 'misQcCheck', 'misJobPhase'].map((child) => ({ parent: 'misBomStage' as DemoTable, child, fk: 'bomStageId' })),
  ...['misMachineAllocation', 'misProductionLog', 'misLineClearance', 'misQcCheck'].map((child) => ({ parent: 'misMachine' as DemoTable, child, fk: 'machineId' })),
  ...['misProductionLog', 'misLineClearance', 'misWorkerAllocation', 'misShiftRoster', 'misAttendance'].map((child) => ({ parent: 'misShift' as DemoTable, child, fk: 'shiftId' })),
  { parent: 'misShift', child: 'misEmployee', fk: 'defaultShiftId' },
  ...['misProductionLog', 'misWorkerAllocation', 'misMachineAllocation'].map((child) => ({ parent: 'misJobPhase' as DemoTable, child, fk: 'jobPhaseId' })),
  { parent: 'misMachineAllocation', child: 'misWorkerAllocation', fk: 'machineAllocationId' },
  { parent: 'misProductionLog', child: 'misMachineAllocation', fk: 'productionLogId' },
  { parent: 'misAttendance', child: 'misAttendanceBreak', fk: 'attendanceId' },
  { parent: 'misAttendance', child: 'misPunchRegularization', fk: 'resultingAttendanceId' },
  { parent: 'misPayrollPeriod', child: 'misPayrollSnapshotLine', fk: 'periodId' },
];

async function main() {
  const { prisma, execute } = openDb();
  const m = readManifest();
  if (!m) {
    console.log(`No manifest at ${MANIFEST_PATH}: nothing was seeded by this tool, nothing to clean.`);
    await tagScan(prisma);
    console.log('\nDRY RUN only. Nothing changed.');
    await prisma.$disconnect();
    return;
  }
  console.log(`Manifest run ${m.runId}, created ${m.createdAt}, project ${m.projectRef}, chunks: ${m.chunks.map((c) => `${c.name}[${c.state}]`).join(' ')}\n`);

  const problems: string[] = [];
  const present: Partial<Record<DemoTable, string[]>> = {};
  console.log(`${execute ? 'Will delete' : 'WOULD delete'} (manifest rows still present / in manifest):`);
  for (const t of [...DEMO_TABLES].reverse()) {
    const all = idsFor(m, t);
    if (!all.length) continue;
    const rows = await delegate(prisma, t).findMany({ where: { id: { in: all } }, select: { id: true } });
    present[t] = rows.map((r) => r.id as string);
    console.log(`  ${t.padEnd(26)} ${String(rows.length).padStart(4)} / ${all.length}`);
  }

  // dependants outside the manifest
  console.log('\nRows OUTSIDE the manifest that reference demo rows:');
  let foreign = 0;
  for (const dep of DEPENDANTS) {
    const parents = present[dep.parent];
    if (!parents?.length) continue;
    const childManifest = (DEMO_TABLES as readonly string[]).includes(dep.child) ? idsFor(m, dep.child as DemoTable) : [];
    const n = await delegate(prisma, dep.child).count({ where: { [dep.fk]: { in: parents }, ...(childManifest.length ? { id: { notIn: childManifest } } : {}) } });
    if (n) {
      foreign += n;
      problems.push(`${n} ${dep.child} row(s) not in the manifest reference demo ${dep.parent} via ${dep.fk}`);
      console.log(`  ${dep.child}.${dep.fk} -> ${dep.parent}: ${n}`);
    }
  }
  if (!foreign) console.log('  none');

  // kiosk punches since the seed for demo attendance employees
  const attIds = present.misAttendance ?? [];
  if (attIds.length) {
    const emps = [...new Set((await prisma.misAttendance.findMany({ where: { id: { in: attIds } }, select: { employeeId: true } })).map((a) => a.employeeId))];
    const punches = await prisma.misAttendancePunch.count({ where: { employeeId: { in: emps }, receivedAt: { gte: new Date(m.createdAt) } } });
    console.log(`\nReal kiosk punches for the demo-attendance employees since the seed: ${punches}`);
    if (punches) problems.push(`${punches} real punch(es) arrived for demo-attendance employees since the seed: attendance days may now be real, not deleting`);
  }

  // rows edited since the seed (warning only)
  let modified = 0;
  for (const t of STAMPED_TABLES) {
    const ids = present[t];
    if (!ids?.length) continue;
    const rows = await delegate(prisma, t).findMany({ where: { id: { in: ids } }, select: { id: true, updatedAt: true } });
    const changed = rows.filter((r) => m.stamps[r.id as string] && (r.updatedAt as Date).toISOString() !== m.stamps[r.id as string]);
    if (changed.length) {
      modified += changed.length;
      console.log(`  WARNING ${t}: ${changed.length} demo row(s) edited since the seed (still removed)`);
    }
  }
  console.log(`\nDemo rows edited since the seed: ${modified}`);
  await tagScan(prisma, m);

  if (problems.length) {
    console.error('\nREFUSING to delete anything:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('Remove or finish those rows by hand (they are not demo-tagged by the seeder), then re-run.');
    if (execute) process.exit(1);
  }
  if (!execute) {
    console.log('\nDRY RUN only. Nothing changed.');
    await prisma.$disconnect();
    return;
  }

  for (const chunk of [...m.chunks].reverse()) {
    await prisma.$transaction(
      async (tx) => {
        for (const t of [...DEMO_TABLES].reverse()) {
          const ids = chunk.ids[t];
          if (!ids?.length) continue;
          const r = await delegate(tx, t).deleteMany({ where: { id: { in: ids } } });
          console.log(`deleted ${String(r.count).padStart(4)} ${t} (${chunk.name})`);
        }
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
  }
  const done = MANIFEST_PATH.replace(/\.json$/, `.cleaned-${Date.now()}.json`);
  fs.renameSync(MANIFEST_PATH, done);
  console.log(`\nDone. Manifest archived to ${done}`);
  await prisma.$disconnect();
}

/** Report-only: DEMO-tagged rows that are NOT in the manifest. */
async function tagScan(prisma: ReturnType<typeof openDb>['prisma'], m?: ReturnType<typeof readManifest>) {
  const known = (t: DemoTable) => (m ? idsFor(m, t) : []);
  const scans: [string, number][] = [
    ['customers', await prisma.misCustomer.count({ where: { code: { startsWith: 'DEMO-' }, id: { notIn: known('misCustomer') } } })],
    ['suppliers', await prisma.misSupplier.count({ where: { code: { startsWith: 'DEMO-' }, id: { notIn: known('misSupplier') } } })],
    ['items', await prisma.misItem.count({ where: { code: { startsWith: 'DEMO-' }, id: { notIn: known('misItem') } } })],
    ['machines', await prisma.misMachine.count({ where: { code: { startsWith: 'DEMO-' }, id: { notIn: known('misMachine') } } })],
    ['purchase orders', await prisma.misPurchaseOrder.count({ where: { poNumber: { startsWith: 'DEMO-' }, id: { notIn: known('misPurchaseOrder') } } })],
    ['shifts', await prisma.misShift.count({ where: { name: { startsWith: '[DEMO]' }, id: { notIn: known('misShift') } } })],
    ['orders', await prisma.misOrder.count({ where: { description: { startsWith: '[DEMO]' }, id: { notIn: known('misOrder') } } })],
  ];
  const orphans = scans.filter(([, n]) => n);
  console.log(`\nTagged DEMO rows NOT in the manifest (report only, never deleted): ${orphans.length ? orphans.map(([k, n]) => `${k}=${n}`).join(', ') : 'none'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
