/**
 * Go-live QA: seed a TAGGED, end-to-end demo factory story. DRY RUN by default.
 *
 *   pnpm golive:seed-demo                                  # dry run: read-only, prints the plan + blockers
 *   CONFIRM_WIPE=1 pnpm golive:seed-demo -- --execute      # real run, one transaction PER CHUNK
 *
 * TAGGING: every row carries `[DEMO]` / `DEMO-` in a text column where the table has one, AND its id is recorded in
 * data/golive/demo-ids.json (written BEFORE each chunk's transaction opens, ids pre-generated). Cleanup deletes only
 * manifest ids (`pnpm golive:cleanup-demo`).
 *
 * NEVER touched: employees (read-only), existing masters, wage types/rules, kiosk devices. NO punches are written: the
 * punches table is immutable by trigger and only TRUNCATE can clear it (which would destroy real kiosk punches), so the
 * demo attendance is MisAttendance rows only. Demo wages come from the EXISTING default wage rule (employees have no
 * wage code; WG-DAILY-01 applies) - no wage-type rows are created.
 */
import { randomUUID } from 'node:crypto';
import { openDb } from './_gate';
import {
  STAMPED_TABLES, MANIFEST_PATH, delegate, readManifest, writeManifest,
  type DemoManifest, type DemoTable,
} from './_demo-shared';
import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey, resolveFactoryTimezone } from '../../src/lib/mis/factory-time';
import {
  ATTENDANCE_SCRIPT, SAMPLE_SLOT_SHIFT_NAME, buildAttendanceDay, demoLabel, factoryInstant, isSundayKey, lastDateKeys,
  pickSampleEmployees, planResume, runningBalances, type ResumeFound, type SampleSlot,
} from '../../src/lib/mis/demo-seed';

type Row = Record<string, unknown>;
type Step = { table: DemoTable; rows: Row[]; sequential?: boolean };
type Chunk = { name: string; steps: Step[] };

const id = () => randomUUID();
const SLOTS: SampleSlot[] = ['DAY', 'NIGHT', 'GENERAL', 'LADIES', 'HOUSEKEEPING'];

async function main() {
  const { prisma, execute } = openDb();
  const blockers: string[] = [];
  const notes: string[] = [];

  // ---- read-only context -------------------------------------------------------------------------------------
  const now = new Date();
  const zoneRule = await prisma.misBusinessRule.findFirst({
    where: { ruleKey: 'factory.timezone', effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: 'desc' }, select: { ruleValue: true },
  });
  const zone = resolveFactoryTimezone(zoneRule?.ruleValue);
  const today = factoryDateKey(now, zone);
  const day = (offset: number, hhmm = '10:00') => factoryInstant(addDaysToDateKey(today, offset), hhmm, zone);
  const dbDay = (offset: number) => dateKeyToDbDate(addDaysToDateKey(today, offset));
  const [yy, mm] = today.split('-').map(Number);
  const monthKey = `${yy}${String(mm).padStart(2, '0')}`;
  console.log(`Factory zone ${zone}; factory today ${today}\n`);

  const resume = process.argv.includes('--resume');
  const existingManifest = readManifest();
  if (existingManifest && !resume) blockers.push(`${MANIFEST_PATH} already exists (run id ${existingManifest.runId}): run golive:cleanup-demo first, or pass --resume to finish pending chunks`);
  if (resume && !existingManifest) blockers.push('--resume given but no manifest exists: run without --resume');

  // Read-only probe: does the DB know the enum type Prisma casts to? (the schema enum has no @@map; the migration made mis_punch_regularization_status)
  let regularizationOk = true;
  try {
    await prisma.$queryRawUnsafe(`SELECT 'PENDING'::"public"."mis_punch_regularization_status"`);
  } catch {
    regularizationOk = false;
    notes.push('type "public.MisPunchRegularizationStatus" is missing in the DB: mis_punch_regularizations rows are NOT seeded (missed-punch case stays an attendance row only)');
  }

  const shifts = await prisma.misShift.findMany({ select: { id: true, name: true, startTime: true, endTime: true } });
  const shiftByName = new Map(shifts.map((s) => [s.name, s]));
  const shiftIdBySlot = {} as Record<SampleSlot, string | undefined>;
  for (const s of SLOTS) {
    const sh = shiftByName.get(SAMPLE_SLOT_SHIFT_NAME[s]);
    shiftIdBySlot[s] = sh?.id;
    if (!sh) blockers.push(`real shift "${SAMPLE_SLOT_SHIFT_NAME[s]}" not found`);
  }
  const employees = await prisma.misEmployee.findMany({
    select: { id: true, employeeCode: true, name: true, defaultShiftId: true, wageTypeCode: true, userProfileId: true, isActive: true, deletedAt: true },
  });
  const sample = pickSampleEmployees(employees, shiftIdBySlot);
  for (const s of SLOTS) if (!sample[s]) blockers.push(`no sample employee (EMP101+, ${SAMPLE_SLOT_SHIFT_NAME[s]}, no wage code) found`);
  const emp = (s: SampleSlot) => sample[s]?.id ?? '';

  const owner = await prisma.misEmployee.findFirst({ where: { role: 'OWNER', userProfileId: { not: null } }, select: { userProfileId: true } });
  const actorId = owner?.userProfileId ?? null;
  if (!actorId) blockers.push('no OWNER user profile found (needed as signer on signed-off phases)');

  const procCodes = ['PRC-CORR', 'PRC-PRNT-001', 'PROC-001', 'PROC-005', 'PROC-019'];
  const procs = await prisma.misProcess.findMany({ where: { code: { in: procCodes } }, select: { id: true, code: true } });
  const proc = (code: string) => {
    const p = procs.find((x) => x.code === code);
    if (!p) blockers.push(`process ${code} not found`);
    return p?.id ?? '';
  };
  const depts = await prisma.misDepartment.findMany({ where: { code: { in: ['DEPT-CORR-01', 'PRINTING', 'DEPT-FIN'] } }, select: { id: true, code: true } });
  const dept = (code: string) => depts.find((d) => d.code === code)?.id ?? null;

  // collisions with existing rows
  const orderNos = [`ORD-${monthKey}-90001`, `ORD-${monthKey}-90002`, `ORD-${monthKey}-90003`];
  const bomNos = [`BOM-${monthKey}-90001`, `BOM-${monthKey}-90002`, `BOM-${monthKey}-90003`];
  const clash = {
    customers: await prisma.misCustomer.count({ where: { code: { startsWith: 'DEMO-' } } }),
    suppliers: await prisma.misSupplier.count({ where: { code: { startsWith: 'DEMO-' } } }),
    items: await prisma.misItem.count({ where: { code: { startsWith: 'DEMO-' } } }),
    machines: await prisma.misMachine.count({ where: { code: { startsWith: 'DEMO-' } } }),
    orders: await prisma.misOrder.count({ where: { orderNumber: { in: orderNos } } }),
    boms: await prisma.misBom.count({ where: { bomNumber: { in: bomNos } } }),
    pos: await prisma.misPurchaseOrder.count({ where: { poNumber: { startsWith: 'DEMO-' } } }),
    grns: await prisma.misGrn.count({ where: { grnNumber: { startsWith: 'DEMO-' } } }),
    shifts: await prisma.misShift.count({ where: { name: { startsWith: '[DEMO]' } } }),
  };
  for (const [k, v] of Object.entries(clash)) if (v && !resume) blockers.push(`${v} existing ${k} already carry the DEMO tag / demo numbers`);
  const periodExists = await prisma.misPayrollPeriod.findUnique({ where: { year_month: { year: yy, month: mm } }, select: { status: true } });
  if (periodExists) notes.push(`payroll period ${yy}-${mm} already exists (${periodExists.status}): NOT created, NOT touched`);

  // ---- ids ---------------------------------------------------------------------------------------------------
  const shiftDemo = id();
  const cus = [id(), id()];
  const sup = [id(), id()];
  const itemDefs = [
    { code: 'DEMO-RM-001', name: 'Kraft Liner 150gsm', cat: 'RAW_MATERIAL', unit: 'KG', price: 58, reorder: 500, gsm: '150' },
    { code: 'DEMO-RM-002', name: 'Duplex Board 300gsm', cat: 'RAW_MATERIAL', unit: 'KG', price: 72, reorder: 400, gsm: '300' },
    { code: 'DEMO-RM-003', name: 'Flexo Ink Process Black', cat: 'CONSUMABLE', unit: 'KG', price: 420, reorder: 40, gsm: null },
    { code: 'DEMO-RM-004', name: 'Water-based Adhesive', cat: 'CONSUMABLE', unit: 'KG', price: 95, reorder: 50, gsm: null },
    { code: 'DEMO-CN-001', name: 'Strapping Roll', cat: 'CONSUMABLE', unit: 'PIECE', price: 180, reorder: 20, gsm: null },
  ].map((d) => ({ ...d, id: id() }));
  const item = (code: string) => itemDefs.find((d) => d.code === code)!;
  const mach = [
    { id: id(), code: 'DEMO-MCH-01', name: 'Corrugator Line', dept: dept('DEPT-CORR-01') },
    { id: id(), code: 'DEMO-MCH-02', name: 'Flexo Printer 4-colour', dept: dept('PRINTING') },
    { id: id(), code: 'DEMO-MCH-03', name: 'Laminator and Die Cutter', dept: dept('DEPT-FIN') },
  ];
  const orders = orderNos.map((n, i) => ({ id: id(), no: n, bomId: id(), bomNo: bomNos[i] }));
  const po = [{ id: id(), no: 'DEMO-PO-001' }, { id: id(), no: 'DEMO-PO-002' }];
  const grn = [{ id: id(), no: 'DEMO-GRN-001' }, { id: id(), no: 'DEMO-GRN-002' }];

  // ---- chunk 1: masters --------------------------------------------------------------------------------------
  const masters: Chunk = {
    name: '1-masters',
    steps: [
      { table: 'misShift', rows: [{ id: shiftDemo, name: demoLabel('Shift'), startTime: '08:00', endTime: '16:00', isDefault: false, isActive: true, updatedAt: now }] },
      {
        table: 'misCustomer',
        rows: [
          { id: cus[0], code: 'DEMO-CUS-001', name: demoLabel('Sunrise Foods Pvt Ltd'), phone: '0000000001', city: 'Demo City', updatedAt: now },
          { id: cus[1], code: 'DEMO-CUS-002', name: demoLabel('Metro Pharma Packaging'), phone: '0000000002', city: 'Demo City', updatedAt: now },
        ],
      },
      {
        table: 'misSupplier',
        rows: [
          { id: sup[0], code: 'DEMO-SUP-001', name: demoLabel('Shree Paper Mills'), phone: '0000000003', city: 'Demo City', paymentTermsDays: 30, updatedAt: now },
          { id: sup[1], code: 'DEMO-SUP-002', name: demoLabel('Vijay Ink and Chemicals'), phone: '0000000004', city: 'Demo City', paymentTermsDays: 45, updatedAt: now },
        ],
      },
      {
        table: 'misItem',
        rows: itemDefs.map((d) => ({
          id: d.id, code: d.code, name: demoLabel(d.name), category: d.cat, unit: d.unit, pricePerUnit: d.price,
          reorderLevel: d.reorder, gsm: d.gsm, isDemo: true, updatedAt: now,
        })),
      },
      {
        table: 'misMachine',
        rows: mach.map((m, i) => ({ id: m.id, code: m.code, name: demoLabel(m.name), departmentId: m.dept, capacityPerDay: 6000, sortOrder: 900 + i, updatedAt: now })),
      },
    ],
  };

  // ---- chunk 2: stock movements (opening, GRN receipts, issues) ----------------------------------------------
  type Move = { itemId: string; change: number; source: string; sourceId: string | null; note: string; at: Date; type: 'IN' | 'OUT'; ref: string | null };
  const moves: Move[] = [
    ...[['DEMO-RM-001', 2000], ['DEMO-RM-002', 1500], ['DEMO-RM-003', 100]].map(([c, q]) => ({
      itemId: item(c as string).id, change: q as number, source: 'STORE_IN', sourceId: null, note: '[DEMO] opening stock', at: day(-30, '08:00'), type: 'IN' as const, ref: 'DEMO-OPENING',
    })),
    ...[['DEMO-RM-001', 1000], ['DEMO-RM-004', 200]].map(([c, q]) => ({
      itemId: item(c as string).id, change: q as number, source: 'GRN', sourceId: grn[0].id, note: `GRN ${grn[0].no}`, at: day(-14, '11:00'), type: 'IN' as const, ref: grn[0].no,
    })),
    ...[['DEMO-RM-003', 100], ['DEMO-CN-001', 50]].map(([c, q]) => ({
      itemId: item(c as string).id, change: q as number, source: 'GRN', sourceId: grn[1].id, note: `GRN ${grn[1].no}`, at: day(-9, '11:00'), type: 'IN' as const, ref: grn[1].no,
    })),
    ...[['DEMO-RM-001', 850], ['DEMO-RM-004', 120], ['DEMO-RM-003', 30]].map(([c, q]) => ({
      itemId: item(c as string).id, change: -(q as number), source: 'STORE_ISSUE', sourceId: orders[0].id, note: orders[0].no, at: day(-12, '09:00'), type: 'OUT' as const, ref: orders[0].no,
    })),
    ...[['DEMO-RM-002', 500], ['DEMO-RM-003', 25]].map(([c, q]) => ({
      itemId: item(c as string).id, change: -(q as number), source: 'STORE_ISSUE', sourceId: orders[1].id, note: orders[1].no, at: day(-2, '09:00'), type: 'OUT' as const, ref: orders[1].no,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const bal = runningBalances(moves.map((m) => ({ itemId: m.itemId, change: m.change })));
  const stock: Chunk = {
    name: '2-stock',
    steps: [
      {
        table: 'misInventoryLedger',
        rows: moves.map((m, i) => ({ id: id(), itemId: m.itemId, changeQty: m.change, balanceQty: bal[i], source: m.source, sourceId: m.sourceId, notes: m.note, createdAt: new Date(m.at.getTime() + i * 1000) })),
      },
      {
        table: 'misStoreTransaction',
        rows: moves.map((m, i) => ({
          id: id(), txnNumber: `DEMO-STXN-${String(i + 1).padStart(4, '0')}`, itemId: m.itemId, type: m.type, quantity: Math.abs(m.change),
          balanceQty: bal[i], referenceNo: m.ref, reason: '[DEMO]', isOverIssue: false, createdAt: new Date(m.at.getTime() + i * 1000),
        })),
      },
    ],
  };

  // ---- chunk 3: procurement ----------------------------------------------------------------------------------
  const poItems = [
    { id: id(), poId: po[0].id, item: item('DEMO-RM-001'), qty: 1000, rate: 58, received: 1000 },
    { id: id(), poId: po[0].id, item: item('DEMO-RM-004'), qty: 200, rate: 95, received: 200 },
    { id: id(), poId: po[1].id, item: item('DEMO-RM-003'), qty: 150, rate: 420, received: 100 },
    { id: id(), poId: po[1].id, item: item('DEMO-CN-001'), qty: 50, rate: 180, received: 50 },
  ];
  const po1Net = 1000 * 58 + 200 * 95;
  const po2Net = 100 * 420 + 50 * 180;
  const gross = (n: number) => Math.round(n * 1.18 * 100) / 100;
  const procurement: Chunk = {
    name: '3-procurement',
    steps: [
      {
        table: 'misPurchaseOrder',
        rows: [
          { id: po[0].id, poNumber: po[0].no, supplierId: sup[0], status: 'COMPLETE', bomRef: orders[0].no, purpose: 'FOR_ORDER', notes: demoLabel('PO raised against demo order 1'), deliveryDueDate: dbDay(-14), paymentTerms: 'Net 30', approvalMode: 'ADMIN_ONLY', approvedAt: day(-17), createdAt: day(-18), updatedAt: now },
          { id: po[1].id, poNumber: po[1].no, supplierId: sup[1], status: 'PARTIAL', bomRef: null, purpose: 'BUFFER_STOCK', notes: demoLabel('Buffer stock top-up, ink short-shipped'), deliveryDueDate: dbDay(-9), paymentTerms: 'Net 45', approvalMode: 'ADMIN_ONLY', approvedAt: day(-10), createdAt: day(-10), updatedAt: now },
        ],
      },
      {
        table: 'misPoItem',
        rows: poItems.map((p, i) => ({ id: p.id, poId: p.poId, itemId: p.item.id, description: demoLabel(p.item.name), quantity: p.qty, unitId: p.item.unit, ratePerUnit: p.rate, receivedQuantity: p.received, sortOrder: i })),
      },
      {
        table: 'misGrn',
        rows: [
          { id: grn[0].id, grnNumber: grn[0].no, poId: po[0].id, status: 'CONFIRMED', receivedAt: day(-14, '11:00'), notes: demoLabel('Received in full'), supplierInvoiceNo: 'DEMO-INV-001', invoiceDate: dbDay(-14), supplierInvoiceAmount: gross(po1Net), supplierInvoiceGstPercent: 18, vehicleNumber: 'DEMO-0001', dcNumber: 'DEMO-DC-001', createdAt: day(-14, '11:00'), updatedAt: now },
          { id: grn[1].id, grnNumber: grn[1].no, poId: po[1].id, status: 'CONFIRMED', receivedAt: day(-9, '11:00'), notes: demoLabel('Ink received 100 of 150'), supplierInvoiceNo: 'DEMO-INV-002', invoiceDate: dbDay(-9), supplierInvoiceAmount: gross(po2Net), supplierInvoiceGstPercent: 18, vehicleNumber: 'DEMO-0002', dcNumber: 'DEMO-DC-002', createdAt: day(-9, '11:00'), updatedAt: now },
        ],
      },
      {
        table: 'misGrnItem',
        rows: poItems.map((p, i) => ({
          id: id(), grnId: i < 2 ? grn[0].id : grn[1].id, poItemId: p.id, receivedQty: p.received, type: i < 2 ? 'FOR_ORDER' : 'GENERAL', forOrderRef: i < 2 ? orders[0].no : null,
          batchNo: `DEMO-B${i + 1}`, notes: '[DEMO]', dcQuantity: p.received, damageQuantity: 0, shortQuantity: 0,
        })),
      },
      {
        table: 'misSupplierInvoice',
        rows: [
          { id: id(), poId: po[0].id, grnId: grn[0].id, supplierId: sup[0], invoiceNo: 'DEMO-INV-001', invoiceDate: dbDay(-14), invoiceAmount: gross(po1Net), gstPercent: 18, notes: '[DEMO]', status: 'MATCHED', createdAt: day(-14, '12:00'), updatedAt: now },
          { id: id(), poId: po[1].id, grnId: grn[1].id, supplierId: sup[1], invoiceNo: 'DEMO-INV-002', invoiceDate: dbDay(-9), invoiceAmount: gross(po2Net), gstPercent: 18, notes: '[DEMO]', status: 'PENDING_REVIEW', createdAt: day(-9, '12:00'), updatedAt: now },
        ],
      },
    ],
  };

  // ---- chunk 4: orders + BOM ---------------------------------------------------------------------------------
  type Stage = {
    name: string; code: string; machine: (typeof mach)[number] | null; slot: SampleSlot; days: [number, number]; produced: [number, number]; waste: [number, number];
    reason: string; phase: 'SIGNED_OFF' | 'IN_PROGRESS' | 'PENDING' | null; mat: { item: ReturnType<typeof item>; qty: number }[];
  };
  const stages: Stage[][] = [
    [
      { name: 'Corrugation', code: 'PRC-CORR', machine: mach[0], slot: 'NIGHT', days: [-12, -11], produced: [2700, 2600], waste: [150, 150], reason: 'Flute crush at start-up', phase: 'SIGNED_OFF', mat: [{ item: item('DEMO-RM-001'), qty: 850 }] },
      { name: 'Flexo printing', code: 'PRC-PRNT-001', machine: mach[1], slot: 'DAY', days: [-10, -9], produced: [2600, 2550], waste: [100, 50], reason: 'Colour match adjustment', phase: 'SIGNED_OFF', mat: [{ item: item('DEMO-RM-003'), qty: 30 }] },
      { name: 'Die cutting', code: 'PROC-001', machine: mach[2], slot: 'DAY', days: [-8, -7], produced: [2540, 2520], waste: [60, 30], reason: 'Creasing rule set-up', phase: 'SIGNED_OFF', mat: [{ item: item('DEMO-RM-004'), qty: 120 }] },
      { name: 'Packing', code: 'PROC-019', machine: null, slot: 'HOUSEKEEPING', days: [-6, -5], produced: [2520, 2500], waste: [20, 0], reason: 'Torn carton', phase: 'SIGNED_OFF', mat: [{ item: item('DEMO-CN-001'), qty: 20 }] },
    ],
    [
      { name: 'Flexo printing', code: 'PRC-PRNT-001', machine: mach[1], slot: 'DAY', days: [-4, -3], produced: [1600, 1600], waste: [120, 80], reason: 'Ink smudge on first sheets', phase: 'SIGNED_OFF', mat: [{ item: item('DEMO-RM-002'), qty: 500 }, { item: item('DEMO-RM-003'), qty: 25 }] },
      { name: 'Lamination', code: 'PROC-005', machine: mach[2], slot: 'GENERAL', days: [-2, -1], produced: [1400, 1300], waste: [60, 40], reason: 'Bubble in film', phase: 'IN_PROGRESS', mat: [{ item: item('DEMO-RM-004'), qty: 40 }] },
      { name: 'Die cutting', code: 'PROC-001', machine: null, slot: 'DAY', days: [0, 0], produced: [0, 0], waste: [0, 0], reason: '', phase: 'PENDING', mat: [] },
      { name: 'Packing', code: 'PROC-019', machine: null, slot: 'HOUSEKEEPING', days: [0, 0], produced: [0, 0], waste: [0, 0], reason: '', phase: 'PENDING', mat: [] },
    ],
    [
      { name: 'Flexo printing', code: 'PRC-PRNT-001', machine: null, slot: 'DAY', days: [0, 0], produced: [0, 0], waste: [0, 0], reason: '', phase: null, mat: [{ item: item('DEMO-RM-002'), qty: 300 }] },
      { name: 'Die cutting', code: 'PROC-001', machine: null, slot: 'DAY', days: [0, 0], produced: [0, 0], waste: [0, 0], reason: '', phase: null, mat: [] },
    ],
  ];
  const stageRows = stages.map((list) => list.map((s, i) => ({ ...s, stageId: id(), seq: i + 1 })));
  const orderDefs = [
    { status: 'DELIVERED', cust: cus[0], desc: 'Corrugated carton 3-ply 12x10x8', qty: 5000, cpo: 'DEMO-CPO-1101', created: -20, due: -3, notes: 'Completed and delivered' },
    { status: 'IN_PRODUCTION', cust: cus[1], desc: 'Printed duplex carton 4-colour', qty: 3000, cpo: 'DEMO-CPO-1102', created: -6, due: 6, notes: 'Accepted, in production' },
    { status: 'CANCELLED', cust: cus[0], desc: 'Rigid gift box with foil', qty: 2000, cpo: 'DEMO-CPO-1103', created: -8, due: 10, notes: 'Rejected: dimension tolerance not achievable' },
  ];
  const ordersChunk: Chunk = {
    name: '4-orders-bom',
    steps: [
      {
        table: 'misOrder',
        rows: orders.map((o, i) => ({
          id: o.id, orderNumber: o.no, customerId: orderDefs[i].cust, status: orderDefs[i].status, description: demoLabel(orderDefs[i].desc),
          deliveryDate: day(orderDefs[i].due), notes: demoLabel(orderDefs[i].notes), quantity: orderDefs[i].qty, unit: 'PIECE', customerPoRef: orderDefs[i].cpo,
          createdAt: day(orderDefs[i].created), updatedAt: now,
        })),
      },
      {
        table: 'misOrderStockAllocation',
        rows: [
          { id: id(), orderId: orders[0].id, itemId: item('DEMO-RM-001').id, allocatedQty: 1000, source: 'GRN', sourceId: grn[0].id, createdAt: day(-14, '11:05') },
          { id: id(), orderId: orders[0].id, itemId: item('DEMO-RM-004').id, allocatedQty: 200, source: 'GRN', sourceId: grn[0].id, createdAt: day(-14, '11:05') },
        ],
      },
      {
        table: 'misBom',
        rows: orders.map((o, i) => ({
          id: o.bomId, orderId: o.id, bomNumber: o.bomNo, status: i === 2 ? 'DRAFT' : 'APPROVED', notes: demoLabel('Demo BOM'), version: 1,
          approvedAt: i === 2 ? null : day(orderDefs[i].created + 1), createdAt: day(orderDefs[i].created), updatedAt: now,
        })),
      },
      {
        table: 'misBomStage',
        rows: stageRows.flatMap((list, oi) => list.map((s) => ({ id: s.stageId, bomId: orders[oi].bomId, stageName: demoLabel(s.name), processId: proc(s.code), seq: s.seq, notes: '[DEMO]' }))),
      },
      {
        table: 'misBomMaterial',
        rows: stageRows.flatMap((list) => list.flatMap((s) => s.mat.map((m, i) => ({ id: id(), stageId: s.stageId, description: demoLabel(m.item.name), itemId: m.item.id, quantity: m.qty, unit: m.item.unit, ratePerUnit: m.item.price, seq: i + 1 })))),
      },
    ],
  };

  // ---- chunk 5: production -----------------------------------------------------------------------------------
  const phaseRows: Row[] = [];
  const allocRows: Row[] = [];
  const workerRows: Row[] = [];
  const logRows: Row[] = [];
  for (let oi = 0; oi < 2; oi++) {
    for (const s of stageRows[oi]) {
      if (!s.phase) continue;
      const phaseId = id();
      const started = s.phase === 'PENDING' ? null : day(s.days[0], '06:30');
      phaseRows.push({
        id: phaseId, orderId: orders[oi].id, processId: proc(s.code), bomStageId: s.stageId, sequence: s.seq, status: s.phase,
        inChargeEmployeeId: emp(s.slot), startedAt: started, startedById: started ? actorId : null,
        signedOffAt: s.phase === 'SIGNED_OFF' ? day(s.days[1], '18:30') : null, signedOffById: s.phase === 'SIGNED_OFF' ? actorId : null,
        notes: '[DEMO]', createdAt: day(orderDefs[oi].created), updatedAt: now,
      });
      if (s.phase === 'PENDING') continue;
      const open = s.phase === 'IN_PROGRESS';
      if (s.machine) {
        const allocId = id();
        allocRows.push({
          id: allocId, machineId: s.machine.id, orderId: orders[oi].id, jobPhaseId: phaseId, allocatedById: actorId,
          startsAt: day(s.days[0], '06:00'), endsAt: day(open ? 1 : s.days[1], '18:00'), releasedAt: open ? null : day(s.days[1], '18:30'), notes: '[DEMO]',
        });
        const allocDate = open ? dbDay(0) : dbDay(s.days[0]);
        const rel = open ? {} : { releasedAt: day(s.days[1], '18:30'), releaseReason: 'PHASE_SIGNED_OFF' };
        workerRows.push(
          { id: id(), machineAllocationId: allocId, employeeId: emp(s.slot), jobPhaseId: phaseId, shiftId: shiftDemo, allocationDate: allocDate, assignedById: actorId, crewRole: 'OPERATOR', notes: '[DEMO]', ...rel },
          { id: id(), machineAllocationId: allocId, employeeId: emp('LADIES'), jobPhaseId: phaseId, shiftId: shiftDemo, allocationDate: allocDate, assignedById: actorId, crewRole: 'HELPER', notes: '[DEMO]', ...rel },
        );
      }
      for (let k = 0; k < 2; k++) {
        logRows.push({
          id: id(), orderId: orders[oi].id, bomStageId: s.stageId, machineId: s.machine?.id ?? null, employeeId: emp(s.slot), shiftId: shiftDemo, jobPhaseId: phaseId,
          qtyProduced: s.produced[k], qtyWaste: s.waste[k], wasteReason: s.waste[k] > 0 ? s.reason : null, unit: 'PIECE',
          loggedAt: day(s.days[k], '17:00'), notes: '[DEMO]', makereadyMinutes: k === 0 ? 45 : 20,
        });
      }
    }
  }
  const production: Chunk = {
    name: '5-production',
    steps: [
      { table: 'misJobPhase', rows: phaseRows, sequential: true }, // the phase-gate trigger needs predecessors visible
      { table: 'misMachineAllocation', rows: allocRows },
      { table: 'misWorkerAllocation', rows: workerRows },
      { table: 'misProductionLog', rows: logRows },
    ],
  };

  // ---- chunk 6: QC -------------------------------------------------------------------------------------------
  const st = (oi: number, n: number) => stageRows[oi][n].stageId;
  const qc = (oi: number, stageId: string | null, offset: number, hhmm: string, param: string, result: 'PASS' | 'FAIL', extra: Row = {}): Row => ({
    id: id(), orderId: orders[oi].id, bomStageId: stageId, checkTime: day(offset, hhmm), result, parameterName: param, notes: '[DEMO]', createdAt: day(offset, hhmm), ...extra,
  });
  const qcChunk: Chunk = {
    name: '6-qc',
    steps: [
      {
        table: 'misQcCheck',
        rows: [
          qc(0, st(0, 1), -10, '10:15', 'Colour density', 'PASS', { machineId: mach[1].id, slotTime: '10:15' }),
          qc(0, st(0, 2), -8, '11:15', 'Dimension', 'FAIL', { machineId: mach[2].id, defectType: 'DEF-DIM', defectQty: 40, notes: '[DEMO] 2mm over on 40 pcs, re-cut' }),
          qc(0, st(0, 2), -8, '15:15', 'Dimension', 'PASS', { machineId: mach[2].id }),
          qc(0, st(0, 3), -5, '16:00', 'Final inspection', 'PASS'),
          qc(1, st(1, 0), -4, '10:15', 'Colour density', 'PASS', { machineId: mach[1].id, slotTime: '10:15' }),
          qc(1, st(1, 0), -3, '11:15', 'Print smudge', 'FAIL', { machineId: mach[1].id, defectType: 'DEF-PRINT', defectQty: 120, notes: '[DEMO] smudge on side panel, unresolved' }),
          qc(1, st(1, 1), -1, '14:15', 'Lamination bond', 'PASS', { machineId: mach[2].id }),
          qc(2, null, -7, '12:00', 'Spec feasibility', 'FAIL', { defectType: 'DEF-DIM', defectQty: 0, notes: '[DEMO] order rejected: dimension tolerance not achievable' }),
        ],
      },
    ],
  };

  // ---- chunk 7: attendance (NO punches) ----------------------------------------------------------------------
  const keys = lastDateKeys(today, 7);
  const attRows: Row[] = [];
  const regRows: Row[] = [];
  const existingAtt = new Set(
    (await prisma.misAttendance.findMany({ where: { employeeId: { in: SLOTS.map(emp).filter(Boolean) }, date: { in: keys.map(dateKeyToDbDate) } }, select: { employeeId: true, date: true } }))
      .map((a) => `${a.employeeId}|${a.date.toISOString().slice(0, 10)}`),
  );
  for (const slot of SLOTS) {
    const shift = shiftByName.get(SAMPLE_SLOT_SHIFT_NAME[slot]);
    if (!shift || !sample[slot]) continue;
    let working = 0;
    for (const key of keys) {
      if (isSundayKey(key)) continue;
      const scenario = ATTENDANCE_SCRIPT[slot][working++] ?? 'NORMAL';
      if (existingAtt.has(`${sample[slot]!.id}|${key}`)) { notes.push(`attendance ${sample[slot]!.employeeCode} ${key} exists: skipped`); continue; }
      const d = buildAttendanceDay({ dateKey: key, shiftStart: shift.startTime, shiftEnd: shift.endTime, scenario, zone });
      const attId = id();
      attRows.push({
        id: attId, employeeId: sample[slot]!.id, date: dateKeyToDbDate(key), shiftId: shift.id, status: d.status, clockIn: d.clockIn, clockOut: d.clockOut,
        otMinutes: d.otMinutes, lateMinutes: d.lateMinutes, notes: d.notes, updatedAt: now,
      });
      if (scenario === 'MISSED_OUT') {
        regRows.push({
          id: id(), employeeId: sample[slot]!.id, workDate: dateKeyToDbDate(key), requestedIn: d.clockIn,
          requestedOut: factoryInstant(addDaysToDateKey(key, shift.endTime <= shift.startTime ? 1 : 0), shift.endTime, zone),
          reason: '[DEMO] forgot to punch out', status: 'PENDING', resultingAttendanceId: null, updatedAt: now,
        });
      }
    }
  }
  const attendance: Chunk = { name: '7-attendance', steps: [{ table: 'misAttendance', rows: attRows }, { table: 'misPunchRegularization', rows: regularizationOk ? regRows : [] }] };

  // ---- chunk 8: payroll period -------------------------------------------------------------------------------
  const payroll: Chunk = {
    name: '8-payroll-period',
    steps: [{ table: 'misPayrollPeriod', rows: periodExists ? [] : [{ id: id(), year: yy, month: mm, status: 'OPEN', updatedAt: now }] }],
  };

  const allChunks = [masters, stock, procurement, ordersChunk, production, qcChunk, attendance, payroll];

  // ---- --resume: verify what the manifest claims, then run only pending / missing chunks ---------------------
  let chunks = allChunks;
  if (resume && existingManifest) {
    const found: Record<string, ResumeFound> = {};
    for (const mc of existingManifest.chunks) {
      found[mc.name] = {};
      for (const [t, ids] of Object.entries(mc.ids)) found[mc.name][t] = ids?.length ? await delegate(prisma, t).count({ where: { id: { in: ids } } }) : 0;
    }
    const plan = planResume(allChunks.map((c) => c.name), existingManifest.chunks, found);
    console.log('Resume plan:');
    for (const d of plan.decisions) console.log(`  ${d.action.toUpperCase().padEnd(6)} ${d.name.padEnd(18)} ${d.reason}`);
    console.log('');
    blockers.push(...plan.blockers);
    const runNames = new Set(plan.decisions.filter((d) => d.action !== 'skip').map((d) => d.name));
    chunks = allChunks.filter((c) => runNames.has(c.name));
  }

  // ---- report ------------------------------------------------------------------------------------------------
  console.log('Sample employees (read-only, attendance rows only):');
  for (const s of SLOTS) console.log(`  ${s.padEnd(13)} ${SAMPLE_SLOT_SHIFT_NAME[s].padEnd(14)} ${sample[s] ? `${sample[s]!.employeeCode} ${sample[s]!.name}${sample[s]!.userProfileId ? ' (has login)' : ''}` : '(none)'}`);
  console.log(`\n${execute ? 'Will create' : 'WOULD create'}:`);
  const totals: Partial<Record<DemoTable, number>> = {};
  for (const c of chunks) {
    console.log(`  chunk ${c.name}`);
    for (const s of c.steps) {
      console.log(`    ${s.table.padEnd(26)} ${s.rows.length}`);
      totals[s.table] = (totals[s.table] ?? 0) + s.rows.length;
    }
  }
  console.log(`  TOTAL rows: ${Object.values(totals).reduce((a, b) => a + (b ?? 0), 0)}`);
  console.log('  punches (mis_attendance_punches): 0 by design (immutable table)');
  for (const n of notes) console.log(`note: ${n}`);
  for (const b of blockers) console.log(`BLOCKER: ${b}`);

  if (!execute) {
    console.log(`\nDRY RUN only. Nothing changed.${blockers.length ? ' Fix the blockers before --execute.' : ''}`);
    await prisma.$disconnect();
    return;
  }
  if (blockers.length) {
    console.error('REFUSING: blockers above.');
    process.exit(1);
  }

  // ---- execute: manifest first, then one transaction per chunk -----------------------------------------------
  const ref = new URL(process.env.DATABASE_URL!).username.split('.').slice(1).join('.');
  const manifest: DemoManifest = resume && existingManifest
    ? { ...existingManifest, chunks: existingManifest.chunks.filter((c) => !chunks.some((r) => r.name === c.name)) } // drop never-committed pending entries; they are re-added below
    : { version: 1, runId: randomUUID(), createdAt: new Date().toISOString(), projectRef: ref, chunks: [], stamps: {} };
  for (const c of chunks) {
    const ids: Partial<Record<DemoTable, string[]>> = {};
    for (const s of c.steps) if (s.rows.length) ids[s.table] = [...(ids[s.table] ?? []), ...s.rows.map((r) => r.id as string)];
    manifest.chunks.push({ name: c.name, state: 'pending', ids });
    writeManifest(manifest); // BEFORE the commit, so a crash can never leave untracked rows
    await prisma.$transaction(
      async (tx) => {
        for (const s of c.steps) {
          if (!s.rows.length) continue;
          const d = delegate(tx, s.table);
          if (s.sequential) for (const r of s.rows) await d.create({ data: r });
          else await d.createMany({ data: s.rows });
        }
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
    const mc = manifest.chunks[manifest.chunks.length - 1];
    mc.state = 'committed';
    for (const t of STAMPED_TABLES) {
      const tids = mc.ids[t];
      if (!tids?.length) continue;
      const rows = await delegate(prisma, t).findMany({ where: { id: { in: tids } }, select: { id: true, updatedAt: true } });
      for (const r of rows) manifest.stamps[r.id as string] = (r.updatedAt as Date).toISOString();
    }
    writeManifest(manifest);
    console.log(`committed ${c.name}`);
  }
  console.log(`\nDone. Manifest: ${MANIFEST_PATH}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
