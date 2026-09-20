import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The login guard, exercised for real (mocking only the Supabase client). The
 * point: a signed-out request to a kiosk door passes through — and a signed-out
 * request to ANY other route, including every near-miss of a kiosk path, is
 * still bounced to /login. This is the test that fails if the exemption widens.
 */

const getUser = vi.fn();
const createServerClient = vi.fn(() => ({ auth: { getUser } }));
vi.mock('@supabase/ssr', () => ({ createServerClient: (...a: unknown[]) => (createServerClient as (...a: unknown[]) => unknown)(...a) }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';

const { updateSession } = await import('./middleware');

const req = (path: string) => new NextRequest(`http://localhost${path}`);

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: null } });
});

describe('a signed-out request to a kiosk door', () => {
  it.each(['/api/mis/kiosk/enrol', '/api/mis/kiosk/enrol/claim', '/api/mis/kiosk/pull', '/api/mis/kiosk/punch'])(
    'passes %s through — no redirect, and the session is not even read',
    async (path) => {
      const res = await updateSession(req(path));

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );
});

describe('everything else is still behind the login redirect', () => {
  it.each([
    '/api/mis/kiosk',
    '/api/mis/kiosk/',
    '/api/mis/kiosk/pull/',
    '/api/mis/kiosk/punches',
    '/api/mis/kiosk/punch/',
    '/api/mis/kiosk/punch/extra',
    '/api/mis/kiosk/pull/extra',
    '/api/mis/kiosks/pull',
    '/api/mis/docs/some-order',
    '/api/mis/inventory/import',
    '/api/mis/trace/x',
    '/mis/kiosk',
    '/mis/settings/devices',
    '/mis',
    '/',
  ])('bounces a signed-out %s to /login', async (path) => {
    const res = await updateSession(req(path));

    expect(res.status).toBe(307);
    // NextURL.clone() keeps a trailing slash the request had; either way it is /login.
    expect(new URL(res.headers.get('location')!).pathname).toMatch(/^\/login\/?$/);
  });

  it('still lets a signed-in user through a portal route', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await updateSession(req('/mis/settings/devices'));
    expect(res.status).toBe(200);
  });
});
