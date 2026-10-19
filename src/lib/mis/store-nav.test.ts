import { describe, expect, it } from 'vitest';

import { MIS_ROLES } from './roles';
import { activeStoreLink, storeNavFor } from './store-nav';

const ids = (role: Parameters<typeof storeNavFor>[0]) => storeNavFor(role).map((g) => g.id);

describe('storeNavFor (R2-64)', () => {
  it('the Store Guy sees all four groups in the agreed order', () => {
    expect(ids('STORE_GUY')).toEqual(['DASHBOARD', 'ISSUE', 'RECEIPTS', 'TRANSACTIONS']);
    expect(storeNavFor('STORE_GUY').map((g) => g.label)).toEqual(['Dashboard', 'Goods Issue', 'Receipts', 'Transactions']);
  });
  it('the Supervisor has no Receipts group and no Physical count link — absent, never greyed', () => {
    expect(ids('SUPERVISOR')).toEqual(['DASHBOARD', 'ISSUE', 'TRANSACTIONS']);
    const all = storeNavFor('SUPERVISOR').flatMap((g) => g.links.map((l) => l.id));
    expect(all).not.toContain('count');
    expect(all).not.toContain('receive');
  });
  it('roles without store.read get nothing at all', () => {
    for (const role of MIS_ROLES.filter((r) => !['OWNER', 'ADMIN', 'SUPERVISOR', 'STORE_GUY'].includes(r))) expect(storeNavFor(role), role).toEqual([]);
    expect(storeNavFor(null)).toEqual([]);
  });
  it('every link lives under /mis/store', () => {
    for (const g of storeNavFor('OWNER')) for (const l of g.links) expect(l.href).toMatch(/^\/mis\/store\//);
  });
});

describe('activeStoreLink', () => {
  it('lights the link for the page and for its children', () => {
    const g = storeNavFor('OWNER');
    expect(activeStoreLink(g, '/mis/store/issue')).toBe('issue');
    expect(activeStoreLink(g, '/mis/store/requests/abc')).toBe('requests');
    expect(activeStoreLink(g, '/mis/store/ledger/abc')).toBeNull();
  });
});
