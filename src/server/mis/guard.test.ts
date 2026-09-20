import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();

// notFound() throws a sentinel in Next; we mimic that so the test can assert
// the guard bailed out rather than returned.
class NotFoundSignal extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
    this.name = 'NotFoundSignal';
  }
}

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundSignal();
  },
}));

vi.mock('@/server/auth', () => ({
  getCurrentUser: () => getCurrentUser(),
}));

const { requireMisAccess } = await import('./guard');

const FLAGGED = 'yash-user-id';
const OTHER = 'existing-client-user';

beforeEach(() => {
  getCurrentUser.mockReset();
  process.env.MIS_ENABLED_ACCOUNTS = FLAGGED;
});

describe('requireMisAccess', () => {
  it('happy path — a flagged account gets the profile back and the page renders', async () => {
    getCurrentUser.mockResolvedValue({ id: FLAGGED, email: 'yash@example.com', name: 'Yash' });

    const user = await requireMisAccess();

    expect(user.id).toBe(FLAGGED);
  });

  it('denied — an unflagged account gets 404, not 403', async () => {
    getCurrentUser.mockResolvedValue({ id: OTHER, email: 'client@example.com', name: 'Client' });

    await expect(requireMisAccess()).rejects.toThrow(NotFoundSignal);
  });

  it('denied — the refusal carries no hint that the MIS exists', async () => {
    getCurrentUser.mockResolvedValue({ id: OTHER, email: 'client@example.com', name: 'Client' });

    const error = await requireMisAccess().catch((e: Error) => e);

    // A 403 would confirm the route is real. The message must stay generic.
    expect(String(error)).not.toMatch(/mis/i);
    expect(String(error)).not.toMatch(/forbidden|permission|403/i);
  });

  it('edge — no session at all bails out without a server error', async () => {
    getCurrentUser.mockResolvedValue(null);

    // The proxy redirects an anonymous visitor to /login before this runs;
    // the guard is the second line, and must fail closed rather than throw a 500.
    await expect(requireMisAccess()).rejects.toThrow(NotFoundSignal);
  });

  it('edge — an empty allow-list locks everyone out, including the flagged id', async () => {
    process.env.MIS_ENABLED_ACCOUNTS = '';
    getCurrentUser.mockResolvedValue({ id: FLAGGED, email: 'yash@example.com', name: 'Yash' });

    await expect(requireMisAccess()).rejects.toThrow(NotFoundSignal);
  });
});
