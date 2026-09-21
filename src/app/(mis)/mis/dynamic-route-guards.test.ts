/**
 * Phase 24F · F-25 — a page for `/mis/<thing>/<id>` must answer 404 to an id that is not a UUID.
 *
 * Found in the browser: /mis/production/sign-off/none rendered "Something went wrong" — the id went to a `@db.Uuid`
 * column and the database refused it. Every `[id]` route checks `isUuid` first. This reads the source of every dynamic
 * page (so a new one cannot be added without the guard) and exercises two of them.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { listFiles } from '@/server/mis/testing/ast';

// The payslip page is the one exception: its existing test (wage-screens.test.tsx) renders it with the id 'e1', which
// the guard would turn into a 404, and an existing test is not edited to suit a change (F-25 lists it as still open).
const NOT_YET_GUARDED = ['print/payslip/[employeeId]'];
const PAGES = listFiles('src/app/(mis)', /^page\.tsx$/).filter((f) => /\/\[[^\]]+\]\//.test(f) && !/\[group\]/.test(f) && !NOT_YET_GUARDED.some((n) => f.includes(n)));

describe('every dynamic MIS page guards its id', () => {
  it('found the pages (a broken glob would pass vacuously)', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(18);
  });

  it.each(PAGES)('%s answers 404 to an id that is not a UUID, before any query', (file) => {
    const src = readFileSync(file, 'utf8');
    const param = /const \{ (\w+) \} = await params;/.exec(src)?.[1];
    expect(param, 'the page reads its id from params').toBeTruthy();
    const guard = src.indexOf(`if (!isUuid(${param})) notFound();`);
    expect(guard, `${file} has no isUuid guard`).toBeGreaterThan(-1);
    // The guard comes BEFORE the first thing that could touch the database.
    const firstUse = src.search(/\b(db\.|get[A-Z]\w*\(|list[A-Z]\w*\()/);
    expect(firstUse === -1 || guard < firstUse).toBe(true);
  });
});

describe('behaviour', () => {
  it('a bad id is a not-found and reaches no server function', async () => {
    const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
    const getGRN = vi.fn();
    vi.doMock('next/navigation', () => ({ notFound }));
    vi.doMock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u' }) }));
    vi.doMock('@/server/mis/auth', () => ({ checkPermission: async () => true }));
    vi.doMock('@/server/mis/grn', () => ({ getGRN }));
    vi.doMock('@/components/mis/grn/grn-detail-screen', () => ({ GrnDetailScreen: () => null }));
    const { default: Page } = await import('./grn/[id]/page');
    await expect(Page({ params: Promise.resolve({ id: 'none' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getGRN).not.toHaveBeenCalled();
    vi.doUnmock('@/server/mis/grn');
  });
});
