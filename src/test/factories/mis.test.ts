/**
 * Phase 15 · MIS-91 — the shared factories themselves stay trustworthy.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeAttendance,
  makeBomMaterial,
  makeEmployee,
  makeItem,
  makeOrder,
  makePoItem,
  makePurchaseOrder,
  resetFactorySequence,
} from './mis';

beforeEach(() => resetFactorySequence());

describe('each factory', () => {
  it('gives every row a unique, stable id within a test — never two rows sharing one', () => {
    const rows = [makeEmployee(), makeEmployee(), makeItem(), makeOrder()];
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('overrides win over the default, and nothing else changes', () => {
    const emp = makeEmployee({ role: 'OWNER', name: 'Named Owner' });
    expect(emp.role).toBe('OWNER');
    expect(emp.name).toBe('Named Owner');
    expect(emp.isActive).toBe(true); // untouched default
  });

  it('resetFactorySequence restarts numbering for test isolation', () => {
    const a = makeItem();
    resetFactorySequence();
    const b = makeItem();
    expect(a.id).toBe(b.id);
  });

  it('a purchase order defaults to BUFFER_STOCK purpose (D1) with no approval decided yet', () => {
    const po = makePurchaseOrder();
    expect(po.purpose).toBe('BUFFER_STOCK');
    expect(po.approvalMode).toBeNull();
  });

  it('a PO item and a BOM material both carry the parent id passed in, not a guessed one', () => {
    const po = makePurchaseOrder();
    const item = makePoItem(po.id);
    expect(item.poId).toBe(po.id);

    const material = makeBomMaterial('stage-1');
    expect(material.stageId).toBe('stage-1');
  });

  it('an attendance row defaults to PRESENT with no edit trail', () => {
    const row = makeAttendance();
    expect(row.status).toBe('PRESENT');
    expect(row.editedAt).toBeNull();
  });
});
