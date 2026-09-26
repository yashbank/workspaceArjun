/**
 * Phase 20 · MIS-279 (case 6) — a legacy `bom_ref IS NULL` row reads as buffer stock.
 * Pure, no Prisma — the whole point of `poPurpose` living in `lib/`.
 */
import { describe, expect, it } from 'vitest';

import { poPurpose, poPurposeLabel } from './po-purpose';

describe('poPurpose — derived from bomRef, never its own field', () => {
  it('a row with a bomRef is FOR_ORDER', () => {
    expect(poPurpose({ bomRef: 'BOM-118' })).toBe('FOR_ORDER');
  });

  it('a row with bomRef null is BUFFER_STOCK — including a pre-existing (legacy) row nobody marked as such', () => {
    expect(poPurpose({ bomRef: null })).toBe('BUFFER_STOCK');
  });

  it('an empty-string bomRef reads the same as null — buffer stock, not a for-order PO with a blank reference', () => {
    expect(poPurpose({ bomRef: '' as unknown as null })).toBe('BUFFER_STOCK');
  });
});

describe('poPurposeLabel', () => {
  it('names both paths for a human reader, neither reading as an error', () => {
    expect(poPurposeLabel('FOR_ORDER')).toBe('From BOM requirement');
    expect(poPurposeLabel('BUFFER_STOCK')).toBe('Buffer stock (no BOM)');
    expect(poPurposeLabel('BUFFER_STOCK')).not.toMatch(/error|missing|incomplete/i);
  });
});
