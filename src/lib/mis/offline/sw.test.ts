// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests the service worker that actually ships — `public/sw.js` — by loading its
 * source with a fake worker global and interrogating it.
 *
 * The worker's real-browser behaviour cannot be unit-tested; what CAN be pinned,
 * and is, is the policy in D16: which two documents are cached, that nothing else
 * ever is, and that data is never answered from cache. If someone widens the list
 * they must edit D16 and the first test below — that is the guard.
 */

const ORIGIN = 'https://mis.example';
const source = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');

type Handler = (event: unknown) => void;

/** A minimal, faithful-enough CacheStorage: string-keyed, no matching quirks. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (key: string | Request) => {
        const hit = store.get(typeof key === 'string' ? key : new URL(key.url).pathname);
        return hit ? hit.clone() : undefined;
      },
      put: async (key: string | Request, res: Response) => {
        store.set(typeof key === 'string' ? key : new URL(key.url).pathname, res.clone());
      },
    };
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
}

function load(fetchImpl: (input: unknown, init?: unknown) => Promise<Response>) {
  const handlers: Record<string, Handler> = {};
  const caches = fakeCaches();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const cjs = { exports: {} as Record<string, unknown> };
  // In a worker, `new Request('/mis/production')` resolves against its own origin.
  class WorkerRequest extends Request {
    constructor(input: string | Request, init?: RequestInit) {
      super(typeof input === 'string' && input.startsWith('/') ? ORIGIN + input : input, init);
    }
  }
  new Function('self', 'caches', 'fetch', 'module', 'Request', source)(self, caches, fetchImpl, cjs, WorkerRequest);
  const policy = cjs.exports as {
    ALLOWED_DOCUMENTS: string[];
    CACHE_NAME: string;
    NAVIGATION_TIMEOUT_MS: number;
    route: (request: unknown, url: URL, origin: string) => string;
    extractAssetUrls: (text: string) => string[];
    extractFontUrls: (css: string) => string[];
    isCacheableDocument: (res: Response, path: string) => boolean;
    offlinePageHtml: () => string;
  };
  return { handlers, caches, self, policy };
}

const req = (url: string, init: { mode?: string; method?: string; headers?: Record<string, string> } = {}) => {
  const request = new Request(url, { method: init.method ?? 'GET', headers: init.headers });
  Object.defineProperty(request, 'mode', { value: init.mode ?? 'cors' });
  return request;
};
const route = (p: ReturnType<typeof load>['policy'], url: string, init?: Parameters<typeof req>[1]) =>
  p.route(req(ORIGIN + url, init), new URL(ORIGIN + url), ORIGIN);

/** Node's Response.clone() drops `url`; a browser's keeps it. Restore that so the worker sees what it would see. */
const withUrl = (res: Response, url: string): Response => {
  Object.defineProperty(res, 'url', { value: url });
  const clone = res.clone.bind(res);
  res.clone = () => withUrl(clone(), url);
  return res;
};

const html = (body = '<html></html>', url = ORIGIN + '/mis/production') =>
  withUrl(new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }), url);

/** Drive the worker's fetch handler the way the browser would. */
async function fire(
  handlers: Record<string, Handler>,
  request: Request,
): Promise<{ responded: boolean; response?: Response; waited: Promise<unknown>[] }> {
  const waited: Promise<unknown>[] = [];
  let responded = false;
  let response: Response | undefined;
  handlers.fetch({
    request,
    respondWith: (p: Promise<Response>) => {
      responded = true;
      response = undefined;
      waited.push(p.then((r) => (response = r)));
    },
    waitUntil: (p: Promise<unknown>) => waited.push(p),
  });
  // waitUntil may be called after respondWith settles, so drain until nothing new arrives.
  for (let seen = 0; seen < waited.length; ) {
    seen = waited.length;
    await Promise.all(waited);
  }
  return { responded, response, waited };
}

afterEach(() => vi.useRealTimers());

describe('D16 — exactly two documents work offline', () => {
  it('THE GUARD: the allow-list is these two routes and nothing else', () => {
    const { policy } = load(async () => html());
    // Adding a route means editing this assertion AND the D16 row in DECISIONS.md.
    expect(policy.ALLOWED_DOCUMENTS).toEqual(['/mis/production', '/mis/kiosk']);
  });

  it.each(['/mis/production', '/mis/production/', '/mis/production?order=1', '/mis/kiosk'])(
    'serves the navigation %s network-first',
    (url) => {
      expect(route(load(async () => html()).policy, url, { mode: 'navigate' })).toBe('DOCUMENT');
    },
  );

  it.each([
    ['the MIS home', '/mis'],
    ['a dynamic order route — its ids cannot be known in advance', '/mis/production/6f1c0c40-1111-4111-8111-aaaaaaaaaaaa'],
    ['orders', '/mis/orders'],
    ['payroll — money must never be cached', '/mis/payroll'],
    ['a look-alike prefix', '/mis/production-report'],
    ['the file manager sharing this origin', '/files'],
  ])('does NOT cache %s', (_label, url) => {
    expect(route(load(async () => html()).policy, url, { mode: 'navigate' })).not.toBe('DOCUMENT');
  });
});

describe('data is never served stale (D16)', () => {
  const { policy } = load(async () => html());

  it.each([
    ['an RSC flight request', '/mis/production', { headers: { RSC: '1' } }],
    ['a flight prefetch', '/mis/production', { headers: { 'Next-Router-Prefetch': '1' } }],
    ['a flight fetch by accept type', '/mis/production', { headers: { Accept: 'text/x-component' } }],
    ['a flight fetch by query', '/mis/production?_rsc=abc', {}],
    ['a server action', '/mis/production', { method: 'POST', headers: { 'Next-Action': 'abc' } }],
    ['any POST', '/mis/production', { method: 'POST' }],
    ['an API call', '/api/mis/inventory/template', {}],
  ])('never intercepts %s', (_label, url, init) => {
    expect(route(policy, url, { mode: 'navigate', ...init })).toBe('PASS');
  });

  it('never intercepts another origin', () => {
    expect(policy.route(req('https://elsewhere.example/mis/production', { mode: 'navigate' }), new URL('https://elsewhere.example/mis/production'), ORIGIN)).toBe('PASS');
  });

  it('passes every non-navigation, non-static request straight to the network', () => {
    expect(route(policy, '/mis/production', {})).toBe('PASS');
    expect(route(policy, '/manifest.json', {})).toBe('PASS');
  });

  it('does not call respondWith for data even when a cached copy exists and the network is down', async () => {
    const worker = load(async () => {
      throw new TypeError('Failed to fetch');
    });
    const cache = await worker.caches.open(worker.policy.CACHE_NAME);
    await cache.put('/mis/production', html());

    const rsc = await fire(worker.handlers, req(ORIGIN + '/mis/production', { headers: { RSC: '1' } }));
    const api = await fire(worker.handlers, req(ORIGIN + '/api/mis/x'));

    expect(rsc.responded).toBe(false);
    expect(api.responded).toBe(false);
  });
});

describe('navigation: network-first, cache fallback', () => {
  it('returns the live page and refreshes the cached copy', async () => {
    const worker = load(async () => html('<html>live</html>'));

    const out = await fire(worker.handlers, req(ORIGIN + '/mis/production', { mode: 'navigate' }));

    expect(await out.response!.text()).toBe('<html>live</html>');
    const cached = await (await worker.caches.open(worker.policy.CACHE_NAME)).match('/mis/production');
    expect(await cached!.text()).toBe('<html>live</html>');
  });

  it('falls back to the cached copy when the network is down', async () => {
    let up = true;
    const worker = load(async () => {
      if (!up) throw new TypeError('Failed to fetch');
      return html('<html>as of morning</html>');
    });
    await fire(worker.handlers, req(ORIGIN + '/mis/production', { mode: 'navigate' }));

    up = false;
    const out = await fire(worker.handlers, req(ORIGIN + '/mis/production', { mode: 'navigate' }));

    expect(await out.response!.text()).toBe('<html>as of morning</html>');
  });

  it('falls back when the link is connected but dead — it does not wait for ever', async () => {
    vi.useFakeTimers();
    const worker = load((_input, init) =>
      new Promise((_resolve, reject) => {
        (init as { signal: AbortSignal }).signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    );
    const cache = await worker.caches.open(worker.policy.CACHE_NAME);
    await cache.put('/mis/kiosk', html('<html>cached kiosk</html>', ORIGIN + '/mis/kiosk'));

    const pending = fire(worker.handlers, req(ORIGIN + '/mis/kiosk', { mode: 'navigate' }));
    await vi.advanceTimersByTimeAsync(worker.policy.NAVIGATION_TIMEOUT_MS + 10);
    const out = await pending;

    expect(await out.response!.text()).toBe('<html>cached kiosk</html>');
  });

  it('shows the inline offline page when there is no signal AND nothing cached', async () => {
    const worker = load(async () => {
      throw new TypeError('Failed to fetch');
    });
    const out = await fire(worker.handlers, req(ORIGIN + '/mis/production', { mode: 'navigate' }));
    const body = await out.response!.text();
    expect(body).toContain('No signal');
    expect(body).toContain('href="/mis/production"');
    expect(body).toContain('href="/mis/kiosk"');
  });

  it('answers any OTHER offline navigation with the offline page — and caches nothing for it', async () => {
    const worker = load(async () => {
      throw new TypeError('Failed to fetch');
    });

    const out = await fire(worker.handlers, req(ORIGIN + '/mis/payroll', { mode: 'navigate' }));

    expect(await out.response!.text()).toContain('No signal');
    const store = worker.caches.stores.get(worker.policy.CACHE_NAME);
    expect(store?.has('/mis/payroll') ?? false).toBe(false);
  });

  it('never caches a page it merely passed through', async () => {
    const worker = load(async () => html('<html>orders</html>', ORIGIN + '/mis/orders'));
    await fire(worker.handlers, req(ORIGIN + '/mis/orders', { mode: 'navigate' }));
    expect([...(worker.caches.stores.get(worker.policy.CACHE_NAME)?.keys() ?? [])]).not.toContain('/mis/orders');
  });
});

describe('what may be cached (isCacheableDocument)', () => {
  const { policy } = load(async () => html());

  it('accepts the document that was asked for', () => {
    expect(policy.isCacheableDocument(html(), '/mis/production')).toBe(true);
  });

  it('refuses a redirect — an expired session must not become the cached screen', () => {
    const res = html('<html>login</html>', ORIGIN + '/login');
    Object.defineProperty(res, 'redirected', { value: true });
    expect(policy.isCacheableDocument(res, '/mis/production')).toBe(false);
  });

  it('refuses a page that landed somewhere else', () => {
    expect(policy.isCacheableDocument(html('<html>login</html>', ORIGIN + '/login'), '/mis/production')).toBe(false);
  });

  it('refuses a non-HTML response and an error', () => {
    const json = new Response('{}', { headers: { 'content-type': 'application/json' } });
    Object.defineProperty(json, 'url', { value: ORIGIN + '/mis/production' });
    expect(policy.isCacheableDocument(json, '/mis/production')).toBe(false);
    expect(policy.isCacheableDocument(new Response('no', { status: 500 }), '/mis/production')).toBe(false);
  });
});

describe('static assets — only what the two documents name', () => {
  it('serves a cached asset without touching the network', async () => {
    const fetchSpy = vi.fn(async () => new Response('net'));
    const worker = load(fetchSpy);
    const cache = await worker.caches.open(worker.policy.CACHE_NAME);
    await cache.put(ORIGIN + '/_next/static/chunks/a.js', new Response('cached'));

    const out = await fire(worker.handlers, req(ORIGIN + '/_next/static/chunks/a.js'));

    expect(await out.response!.text()).toBe('cached');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('goes to the network on a miss and does NOT add it — other pages’ assets are not ours', async () => {
    const worker = load(async () => new Response('net'));

    const out = await fire(worker.handlers, req(ORIGIN + '/_next/static/chunks/other-page.js'));

    expect(await out.response!.text()).toBe('net');
    expect(worker.caches.stores.get(worker.policy.CACHE_NAME)?.size ?? 0).toBe(0);
  });

  it('finds scripts, styles AND the chunks React names only inside the flight payload', () => {
    const { policy } = load(async () => html());
    const page = `
      <link rel="stylesheet" href="/_next/static/css/app-1a2b.css">
      <script src="/_next/static/chunks/main-3c4d.js" async></script>
      <script>self.__next_f.push([1,"5:I[\\"123\\",[\\"static/chunks/prod-screen-5e6f.js\\"],\\"ProductionScreen\\"]"])</script>
      <img src="/logo.png"><script src="https://cdn.example/x.js"></script>`;
    expect(policy.extractAssetUrls(page).sort()).toEqual([
      '/_next/static/chunks/main-3c4d.js',
      '/_next/static/chunks/prod-screen-5e6f.js',
      '/_next/static/css/app-1a2b.css',
    ]);
  });

  it('finds the self-hosted fonts a stylesheet references', () => {
    const { policy } = load(async () => html());
    const css = '@font-face{src:url(/_next/static/media/inter-abc.woff2) format("woff2")} .x{background:url(/logo.png)}';
    expect(policy.extractFontUrls(css)).toEqual(['/_next/static/media/inter-abc.woff2']);
  });

  it('caches the assets a fresh document names, when it refreshes the copy', async () => {
    const worker = load(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/_next/static/')) return new Response('asset');
      return html('<script src="/_next/static/chunks/main-1.js"></script>');
    });

    await fire(worker.handlers, req(ORIGIN + '/mis/production', { mode: 'navigate' }));

    const keys = [...(worker.caches.stores.get(worker.policy.CACHE_NAME)?.keys() ?? [])];
    expect(keys).toContain('/mis/production');
    expect(keys).toContain('/_next/static/chunks/main-1.js');
  });
});

describe('one person’s pages are never shown under another’s session', () => {
  const announce = async (handlers: Record<string, Handler>, userId: string) => {
    const waited: Promise<unknown>[] = [];
    handlers.message({ data: { type: 'MIS_SESSION', userId }, waitUntil: (p: Promise<unknown>) => waited.push(p) });
    await Promise.all(waited);
  };

  it('keeps the cache when the same user announces themselves again', async () => {
    const worker = load(async () => html('<html>ada</html>'));
    await announce(worker.handlers, 'user-a');
    const before = worker.caches.stores.get(worker.policy.CACHE_NAME);
    expect(before?.has('/mis/production')).toBe(true);

    await announce(worker.handlers, 'user-a');
    expect(worker.caches.stores.get(worker.policy.CACHE_NAME)?.has('/mis/production')).toBe(true);
  });

  it('wipes the previous user’s documents when a different user arrives — even while offline', async () => {
    const worker = load(async () => {
      throw new TypeError('Failed to fetch'); // B signs in with no signal: nothing can be re-fetched
    });
    worker.caches.stores.set(worker.policy.CACHE_NAME, new Map([['/mis/production', html('<html>page for A</html>')]]));
    worker.caches.stores.set('mis-session', new Map([['/__mis_session_user__', new Response('user-a')]]));

    await announce(worker.handlers, 'user-b');

    expect(worker.caches.stores.get(worker.policy.CACHE_NAME)?.has('/mis/production') ?? false).toBe(false);
    const marker = await (await worker.caches.open('mis-session')).match('/__mis_session_user__');
    expect(await marker!.text()).toBe('user-b');
  });
});

describe('lifecycle', () => {
  it('prunes caches from older versions but keeps the current one and the session marker', async () => {
    const worker = load(async () => html());
    for (const name of ['mis-offline-v0', worker.policy.CACHE_NAME, 'mis-session', 'someone-elses-cache']) {
      worker.caches.stores.set(name, new Map());
    }

    const waited: Promise<unknown>[] = [];
    worker.handlers.activate({ waitUntil: (p: Promise<unknown>) => waited.push(p) });
    await Promise.all(waited);

    expect([...worker.caches.stores.keys()].sort()).toEqual([worker.policy.CACHE_NAME, 'mis-session', 'someone-elses-cache'].sort());
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });

  it('takes over immediately on install', async () => {
    const worker = load(async () => html());
    const waited: Promise<unknown>[] = [];
    worker.handlers.install({ waitUntil: (p: Promise<unknown>) => waited.push(p) });
    await Promise.all(waited);
    expect(worker.self.skipWaiting).toHaveBeenCalled();
  });

  it('ignores a session message with no user', async () => {
    const worker = load(async () => html());
    const waited: Promise<unknown>[] = [];
    worker.handlers.message({ data: { type: 'MIS_SESSION' }, waitUntil: (p: Promise<unknown>) => waited.push(p) });
    expect(waited).toHaveLength(0);
  });
});
