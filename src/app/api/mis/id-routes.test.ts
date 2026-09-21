/**
 * Phase 24F · F-25 — the two `[orderId]` API routes.
 *
 * Both compared the error message to 'Forbidden', which a `MisForbiddenError` ("Not permitted: orders.read") never
 * equals — so a refused role got a 500 (docs) or a 404 (trace) instead of a 403 — and a malformed id went to a `@db.Uuid`
 * column and came back as a database error. They now answer 404 to a bad id before any query and 403 to a refusal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listDocuments = vi.fn();
const getOrderTrace = vi.fn();
vi.mock('@/server/mis/documents', () => ({ listDocuments: (...a: unknown[]) => listDocuments(...a) }));
vi.mock('@/server/mis/traceability', () => ({ getOrderTrace: (...a: unknown[]) => getOrderTrace(...a) }));

const { GET: docs } = await import('./docs/[orderId]/route');
const { GET: trace } = await import('./trace/[orderId]/route');

const ID = 'a9d4ff27-b07e-46d8-9fb7-c838bab51199';
type Handler = (req: Request, ctx: { params: Promise<{ orderId: string }> }) => Promise<Response>;
const call = (route: Handler, orderId: string) => route(new Request('http://x'), { params: Promise.resolve({ orderId }) });
const forbidden = () => Object.assign(new Error('Not permitted: orders.read'), { name: 'MisForbiddenError' });

beforeEach(() => vi.clearAllMocks());

describe.each([
  ['docs', docs, listDocuments, 500],
  ['trace', trace, getOrderTrace, 404],
] as const)('/api/mis/%s/[orderId]', (_name, route, fn, otherFailure) => {
  it('answers with the data for a real id', async () => {
    fn.mockResolvedValue([{ id: 'x' }]);
    const res = await call(route, ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'x' }]);
    expect(fn).toHaveBeenCalledWith(ID);
  });

  it.each(['none', '', '1', "x' OR 1=1", ID + 'x'])('a bad id (%j) is a 404 and reaches no server function', async (bad) => {
    const res = await call(route, bad);
    expect(res.status).toBe(404);
    expect(fn).not.toHaveBeenCalled();
  });

  it('a refused role is a 403 — not a 500 or a 404', async () => {
    fn.mockRejectedValue(forbidden());
    expect((await call(route, ID)).status).toBe(403);
  });

  it('any other failure is not disguised as a refusal', async () => {
    fn.mockRejectedValue(new Error('connection reset'));
    expect((await call(route, ID)).status).toBe(otherFailure);
  });
});
