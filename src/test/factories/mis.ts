/**
 * Shared MIS test factories (Phase 15, MIS-91).
 *
 * Infrastructure for every later QA phase: one realistic-shaped builder per core
 * entity, instead of each test file hand-rolling its own fixture object and
 * drifting from the real Prisma field names over time. Every field a test is
 * likely to assert on is set to a sane, deterministic default; pass `overrides`
 * for anything a specific test cares about.
 *
 * Test-only. Nothing in the app imports this. Loosely typed on purpose (a fake
 * row is whatever the test under it needs) — same convention as
 * `server/mis/testing/people-world.ts`.
 */
import type { MisRoleName } from '@/lib/mis/roles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a fixture row is whatever shape a fake db expects
export type Row = Record<string, any>;

/** Resets between tests so ids are readable and stable within a single test, not across the suite. */
let seq = 0;
export function resetFactorySequence(): void {
  seq = 0;
}
function nextSeq(): number {
  return ++seq;
}

export function makeEmployee(overrides: Row = {}): Row {
  const n = nextSeq();
  return {
    id: `emp-${n}`,
    userProfileId: null,
    employeeCode: `E${String(n).padStart(3, '0')}`,
    name: `Employee ${n}`,
    nameHi: null,
    role: 'WORKER' as MisRoleName,
    managerId: null,
    departmentId: null,
    isActive: true,
    deletedAt: null,
    wageTypeCode: null,
    payType: 'DAILY',
    sundayPaid: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function makeItem(overrides: Row = {}): Row {
  const n = nextSeq();
  return {
    id: `item-${n}`,
    code: `ITM-${String(n).padStart(4, '0')}`,
    sku: null,
    name: `Item ${n}`,
    category: 'OTHER',
    gsm: null,
    size: null,
    substrate: null,
    coating: null,
    unit: 'KG',
    pricePerUnit: null,
    isDemo: false,
    reorderLevel: null,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function makeOrder(overrides: Row = {}): Row {
  const n = nextSeq();
  return {
    id: `order-${n}`,
    orderNumber: `SO-${String(n).padStart(4, '0')}`,
    customerId: null,
    status: 'DRAFT',
    description: `Order ${n}`,
    deliveryDate: null,
    notes: null,
    createdById: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** A supplier purchase order (`src/server/mis/po.ts`), not the customer's own document (D3). */
export function makePurchaseOrder(overrides: Row = {}): Row {
  const n = nextSeq();
  return {
    id: `po-${n}`,
    poNumber: `PO-${String(n).padStart(4, '0')}`,
    supplierId: null,
    status: 'DRAFT',
    bomRef: null,
    purpose: 'BUFFER_STOCK',
    notes: null,
    createdById: null,
    approvalMode: null,
    adminApprovedById: null,
    adminApprovedAt: null,
    approvedById: null,
    approvedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function makePoItem(poId: string, overrides: Row = {}): Row {
  const n = nextSeq();
  return {
    id: `poitem-${n}`,
    poId,
    itemId: null,
    description: `Material ${n}`,
    quantity: 100,
    unitId: null,
    ratePerUnit: 10,
    receivedQuantity: 0,
    sortOrder: n,
    ...overrides,
  };
}

export function makeBomMaterial(stageId: string, overrides: Row = {}): Row {
  const n = nextSeq();
  return {
    id: `bommat-${n}`,
    stageId,
    description: `BOM material ${n}`,
    itemId: null,
    quantity: 10,
    unit: 'KG',
    ratePerUnit: null,
    seq: n,
    ...overrides,
  };
}

export function makeAttendance(overrides: Row = {}): Row {
  const n = nextSeq();
  return {
    id: `att-${n}`,
    employeeId: null,
    date: new Date('2026-01-01T00:00:00Z'),
    shiftId: null,
    status: 'PRESENT',
    clockIn: null,
    clockOut: null,
    lateMinutes: 0,
    otMinutes: 0,
    approvedOut: false,
    notes: null,
    editedAt: null,
    ...overrides,
  };
}
