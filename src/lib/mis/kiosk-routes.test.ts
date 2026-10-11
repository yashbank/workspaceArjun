import { describe, expect, it } from 'vitest';

import { isKioskDeviceRequest, isKioskDeviceRoute, KIOSK_DEVICE_ROUTES } from './kiosk-routes';

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

describe('the badge-photo door is bearer-only and pattern-exact', () => {
  const ID = '123e4567-e89b-42d3-a456-426614174000';
  const photo = `/api/mis/employees/${ID}/photo`;

  it('bearer present -> passes through the login guard', () => {
    expect(isKioskDeviceRequest(photo, 'Bearer abc.def')).toBe(true);
  });

  it.each([null, undefined, '', 'Basic abc', 'Bearer', 'Bearer '])('no usable bearer (%s) -> redirected to login', (auth) => {
    expect(isKioskDeviceRequest(photo, auth)).toBe(false);
  });

  it.each([
    ['employee list', '/api/mis/employees'],
    ['employee record', `/api/mis/employees/${ID}`],
    ['photo with trailing slash', `${photo}/`],
    ['photo sub-path', `${photo}/extra`],
    ['non-uuid id', '/api/mis/employees/abc/photo'],
    ['traversal', `/api/mis/employees/${ID}/../x/photo`],
    ['other employee sub-route', `/api/mis/employees/${ID}/salary`],
    ['look-alike prefix', `/api/mis/employeesx/${ID}/photo`],
  ])('other employees paths stay protected even with a bearer (%s)', (_l, path) => {
    expect(isKioskDeviceRequest(path, 'Bearer abc')).toBe(false);
  });

  it('the exact door list is unchanged and still exempt without a header', () => {
    expect(isKioskDeviceRequest('/api/mis/kiosk/pull', null)).toBe(true);
    expect(isKioskDeviceRequest('/api/mis/docs/abc', 'Bearer abc')).toBe(false);
  });
});
