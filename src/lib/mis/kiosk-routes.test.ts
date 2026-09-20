import { describe, expect, it } from 'vitest';

import { isKioskDeviceRoute, KIOSK_DEVICE_ROUTES } from './kiosk-routes';

/**
 * This list is the ONLY thing that skips the portal's login redirect. Widening it
 * opens an unauthenticated door into the MIS, so it is pinned here: adding a route
 * means editing this test, and — per D18 — arranging for that route to authenticate
 * by device credential itself.
 */
describe('the kiosk auth exemption is an exact list (D18)', () => {
  it('THE GUARD: exactly these four doors, and nothing else', () => {
    expect([...KIOSK_DEVICE_ROUTES]).toEqual([
      '/api/mis/kiosk/enrol',
      '/api/mis/kiosk/enrol/claim',
      '/api/mis/kiosk/pull',
      '/api/mis/kiosk/punch',
    ]);
  });

  it.each(KIOSK_DEVICE_ROUTES)('exempts %s', (path) => {
    expect(isKioskDeviceRoute(path)).toBe(true);
  });

  it.each([
    ['the bare prefix', '/api/mis/kiosk'],
    ['the prefix with a slash', '/api/mis/kiosk/'],
    ['a trailing slash on a real door', '/api/mis/kiosk/pull/'],
    ['a sibling route nobody has added', '/api/mis/kiosk/punches'],
    ['a punch-like path that is not the door', '/api/mis/kiosk/punch/extra'],
    ['the punch door with a trailing slash', '/api/mis/kiosk/punch/'],
    ['a child of a real door', '/api/mis/kiosk/pull/extra'],
    ['a look-alike prefix', '/api/mis/kiosks/pull'],
    ['a look-alike suffix', '/api/mis/kiosk/pulled'],
    ['another MIS API route', '/api/mis/docs/abc'],
    ['another MIS API route', '/api/mis/inventory/import'],
    ['the portal kiosk page', '/mis/kiosk'],
    ['a case variant', '/API/MIS/KIOSK/PULL'],
    ['a dot-segment escape', '/api/mis/kiosk/../docs/x'],
    ['an encoded slash', '/api/mis/kiosk%2Fpull'],
    ['a query string smuggled into the path', '/api/mis/kiosk/pull?x=/api/mis/docs'],
    ['the empty path', ''],
    ['the root', '/'],
  ])('does NOT exempt %s (%s)', (_label, path) => {
    expect(isKioskDeviceRoute(path)).toBe(false);
  });
});
