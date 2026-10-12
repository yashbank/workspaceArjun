import { describe, expect, it } from 'vitest';

import { asResult, mapPrismaError, unwrap } from './action-result';

describe('asResult / unwrap', () => {
  it('a business refusal travels as data and comes back out as the same message', async () => {
    const r = await asResult(async () => { throw new Error('Cannot issue more than is allocated'); });
    expect(r).toEqual({ ok: false, detail: 'Cannot issue more than is allocated' });
    expect(() => unwrap(r)).toThrow('Cannot issue more than is allocated');
  });
  it('success carries the value', async () => {
    const r = await asResult(async () => 42);
    expect(r).toEqual({ ok: true, value: 42 });
    expect(unwrap(r)).toBe(42);
  });
  it('a permission refusal is still thrown (the error boundary owns it)', async () => {
    const forbidden = Object.assign(new Error('Not permitted: store.write'), { digest: 'MIS_FORBIDDEN' });
    await expect(asResult(async () => { throw forbidden; })).rejects.toBe(forbidden);
  });
  it('a messageless failure gets the generic line', async () => {
    expect(await asResult(async () => { throw new Error(''); })).toEqual({ ok: false, detail: 'That did not save. Try again.' });
  });
});

describe('mapPrismaError', () => {
  const prisma = (code: string, meta?: Record<string, unknown>) =>
    Object.assign(new Error(`Unique constraint failed (${code})`), { code, meta });

  it('P2002 names the entity, field and value', () => {
    const e = prisma('P2002', { target: ['code'] });
    expect(mapPrismaError(e, { entity: 'Supplier', fields: { code: 'SUP-1' } })).toBe("Supplier with code 'SUP-1' already exists");
  });
  it('P2002 without a supplied value still names the field', () => {
    expect(mapPrismaError(prisma('P2002', { target: ['sku'] }), { entity: 'Item' })).toBe('Item with sku already exists');
  });
  it('P2002 reads a constraint-name target and a multi-column target', () => {
    expect(mapPrismaError(prisma('P2002', { target: 'MisSupplier_code_key' }), { entity: 'Supplier' })).toBe('Supplier with code already exists');
    expect(mapPrismaError(prisma('P2002', { target: ['name', 'plant'] }), { entity: 'Machine', fields: { name: 'M1' } })).toBe(
      "Machine with name 'M1' and plant already exists",
    );
  });
  it('P2003 says the record is used elsewhere', () => {
    expect(mapPrismaError(prisma('P2003'), { entity: 'Department' })).toBe('Cannot change this: it is used elsewhere');
  });
  it('other errors keep their own message', () => {
    expect(mapPrismaError(prisma('P2025'), { entity: 'X' })).toBe('Unique constraint failed (P2025)');
    expect(mapPrismaError(new Error('plain'), { entity: 'X' })).toBe('plain');
    expect(mapPrismaError('weird', { entity: 'X' })).toBe('That did not save. Try again.');
  });
  it('asResult maps a Prisma error but leaves other shapes unchanged', async () => {
    const dup = await asResult(async () => { throw prisma('P2002', { target: ['code'] }); }, { entity: 'Customer', fields: { code: 'C9' } });
    expect(dup).toEqual({ ok: false, detail: "Customer with code 'C9' already exists" });
    expect(await asResult(async () => { throw prisma('P2003'); })).toEqual({ ok: false, detail: 'Cannot change this: it is used elsewhere' });
    expect(await asResult(async () => { throw new Error('Cannot issue more'); })).toEqual({ ok: false, detail: 'Cannot issue more' });
    expect(await asResult(async () => { throw new Error(''); })).toEqual({ ok: false, detail: 'That did not save. Try again.' });
    expect(await asResult(async () => { throw 'x'; })).toEqual({ ok: false, detail: 'That did not save. Try again.' });
  });
});
