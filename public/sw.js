/*
 * The MIS service worker.
 *
 * THE SPEC IS D16 in docs/DECISIONS.md. Read it before changing anything here.
 * Its whole point is to be SMALL and NAMED: exactly two documents work offline,
 * and this file is the only place that list lives.
 *
 * Why it exists. Phase 10 built a queue that keeps *writes* safe with no signal,
 * but a queue is useless if the screen it feeds will not load. So the production
 * entry screen and the gate kiosk screen are cached — and nothing else, because
 * caching data means serving it stale, and "a supervisor acting on yesterday's
 * machine list is worse than one who knows he is offline".
 *
 * Plain JavaScript on purpose: no build step, no dependency, and the policy below
 * is written as pure functions so a test can load this file and interrogate it
 * (src/lib/mis/offline/sw.test.ts). That test is the guard against widening the
 * list by accident — adding a route means editing D16 *and* that test.
 */
'use strict';

/** Bump to prune every cache an older worker made. */
const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'mis-offline-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

/**
 * Who the cached pages belong to. A separate cache with a separate prefix, so
 * pruning old versions never deletes it, and so a cache wipe can tell whether a
 * different person has arrived.
 */
const SESSION_CACHE = 'mis-session';
const SESSION_KEY = '/__mis_session_user__';

/**
 * THE LIST. Exactly two documents, matched on pathname only (query and trailing
 * slash ignored). `/mis/production/[id]` is deliberately absent: it is a dynamic
 * route whose ids cannot be known in advance, and `/mis` (the home) is absent by
 * design — everything else in the MIS needs a connection.
 */
const ALLOWED_DOCUMENTS = ['/mis/production', '/mis/kiosk'];

const STATIC_PREFIX = '/_next/static/';

/**
 * How long a navigation may wait on the network before the cached copy is used.
 * Factory wifi is often connected-and-dead rather than off, and a browser will
 * wait a very long time on it. Falling back is safe: the page states its own age.
 */
const NAVIGATION_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Policy — pure, no side effects. Everything below the line is plumbing.
// ---------------------------------------------------------------------------

function normalisePath(pathname) {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function isAllowedDocument(url) {
  return ALLOWED_DOCUMENTS.indexOf(normalisePath(url.pathname)) !== -1;
}

/**
 * React Server Component flight traffic. Next 16's App Router fetches these for
 * client-side navigation and prefetch. They carry *data* and must never be cached
 * or answered from cache — only navigation documents are.
 */
function isFlightRequest(request, url) {
  const h = request.headers;
  const accept = h.get('Accept') || '';
  return (
    h.get('RSC') !== null ||
    h.get('Next-Router-State-Tree') !== null ||
    h.get('Next-Router-Prefetch') !== null ||
    h.get('Next-Action') !== null ||
    accept.indexOf('text/x-component') !== -1 ||
    url.searchParams.has('_rsc')
  );
}

function isStaticAsset(url) {
  return url.pathname.indexOf(STATIC_PREFIX) === 0;
}

/**
 * What to do with a request. The default is PASS — the worker does not touch it,
 * the browser goes to the network exactly as if there were no worker at all.
 *
 *   PASS         not ours. Data, actions, APIs, other origins, every other route.
 *   DOCUMENT     one of the two allowed navigations: network-first, cache fallback.
 *   OFFLINE_PAGE any other navigation in scope: network only; on failure, the
 *                inline offline page (a string in this file — not a cached route).
 *   ASSET        a /_next/static file: served from cache only if already cached.
 */
function route(request, url, origin) {
  if (url.origin !== origin) return 'PASS';
  if (request.method !== 'GET') return 'PASS';
  if (isFlightRequest(request, url)) return 'PASS';
  if (url.pathname.indexOf('/api/') === 0) return 'PASS';

  if (request.mode === 'navigate') {
    return isAllowedDocument(url) ? 'DOCUMENT' : 'OFFLINE_PAGE';
  }
  if (isStaticAsset(url)) return 'ASSET';
  return 'PASS';
}

/**
 * Every /_next/static file a document references — scripts and stylesheets in
 * attributes, AND the chunk paths React embeds in the inline flight payload.
 *
 * The second half matters: a client component's chunk is often named only inside
 * the flight data (as a relative `static/chunks/x.js`), not in any `src=`. Missing
 * those would leave the page rendered but unhydrated offline — a Log button that
 * looks fine and does nothing. So this scans the whole text rather than parsing
 * attributes, and errs toward caching a file too many.
 */
function extractAssetUrls(text) {
  const found = {};
  const re = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[A-Za-z0-9_\-.~%/]+?\.(?:js|css|woff2?|ttf|otf)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const path = raw.indexOf('/_next/') === 0 ? raw : '/_next/' + raw;
    found[path] = true;
  }
  return Object.keys(found);
}

/** Fonts come from CSS (`next/font` self-hosts them under /_next/static/media). */
function extractFontUrls(css) {
  const found = {};
  const re = /url\(\s*["']?((?:\/_next\/)?static\/media\/[^)"'\s]+)["']?\s*\)/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const raw = m[1];
    found[raw.indexOf('/_next/') === 0 ? raw : '/_next/' + raw] = true;
  }
  return Object.keys(found);
}

/**
 * Only cache a response that is genuinely the document we asked for. A session
 * that expired redirects to /login; caching that under the production route would
 * make the offline screen a login page, which is worse than no cache at all.
 */
function isCacheableDocument(response, path) {
  if (!response || !response.ok || response.redirected) return false;
  const type = response.headers.get('content-type') || '';
  if (type.indexOf('text/html') === -1) return false;
  try {
    return normalisePath(new URL(response.url).pathname) === path;
  } catch (e) {
    return false;
  }
}

/** Shown for any navigation the worker cannot serve. Links only to what works. */
function offlinePageHtml() {
  const links = ALLOWED_DOCUMENTS.map(function (p) {
    const label = p === '/mis/production' ? 'Record production' : 'Gate kiosk';
    return '<li><a href="' + p + '">' + label + '</a></li>';
  }).join('');
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Offline</title><style>' +
    'body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f8fafc;color:#0f172a}' +
    'main{max-width:420px;margin:0 auto}h1{font-size:24px}p{color:#475569}' +
    'ul{list-style:none;padding:0}li a{display:block;margin:8px 0;padding:14px;border-radius:12px;' +
    'background:#4f46e5;color:#fff;text-decoration:none;text-align:center;font-weight:600}' +
    '</style></head><body><main><h1>No signal</h1>' +
    '<p>This screen needs a connection. What you record on these two screens is saved on this device and sent when signal returns.</p>' +
    '<ul>' + links + '</ul></main></body></html>'
  );
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, ms);
  return fetch(request, { signal: controller.signal }).then(
    function (res) {
      clearTimeout(timer);
      return res;
    },
    function (err) {
      clearTimeout(timer);
      throw err;
    },
  );
}

/** Cache asset URLs we do not already hold. Never called for anything but a discovered URL. */
function cacheAssets(cache, urls) {
  return Promise.all(
    urls.map(function (u) {
      return cache.match(u).then(function (hit) {
        if (hit) return undefined;
        return fetch(u)
          .then(function (res) {
            if (!res || !res.ok) return undefined;
            const isCss = /\.css(\?|$)/.test(u);
            return cache.put(u, res.clone()).then(function () {
              if (!isCss) return undefined;
              // A stylesheet names its fonts; without them the typeface swaps mid-shift.
              return res.text().then(function (css) {
                return cacheAssets(cache, extractFontUrls(css));
              });
            });
          })
          .catch(function () {
            /* offline or missing: keep whatever we already hold */
          });
      });
    }),
  );
}

function cacheDocument(cache, path, response) {
  if (!isCacheableDocument(response, path)) return Promise.resolve(false);
  const forAssets = response.clone();
  return cache
    .put(path, response)
    .then(function () {
      return forAssets.text();
    })
    .then(function (html) {
      return cacheAssets(cache, extractAssetUrls(html));
    })
    .then(function () {
      return true;
    });
}

function precacheDocuments() {
  return caches.open(CACHE_NAME).then(function (cache) {
    return Promise.all(
      ALLOWED_DOCUMENTS.map(function (path) {
        return fetchWithTimeout(new Request(path, { credentials: 'same-origin', headers: { Accept: 'text/html' } }), 8000)
          .then(function (res) {
            return cacheDocument(cache, path, res);
          })
          .catch(function () {
            /* offline, or the session expired: leave the cache as it was */
          });
      }),
    );
  });
}

function handleDocument(event) {
  const path = normalisePath(new URL(event.request.url).pathname);
  return caches.open(CACHE_NAME).then(function (cache) {
    return fetchWithTimeout(event.request, NAVIGATION_TIMEOUT_MS).then(
      function (res) {
        if (isCacheableDocument(res, path)) {
          // Refresh the copy — and the assets it names — after answering.
          event.waitUntil(cacheDocument(cache, path, res.clone()).catch(function () {}));
        }
        return res;
      },
      function () {
        return cache.match(path).then(function (cached) {
          return cached || offlinePage();
        });
      },
    );
  });
}

function offlinePage() {
  return new Response(offlinePageHtml(), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function handleOtherNavigation(event) {
  return fetch(event.request).catch(function () {
    return offlinePage();
  });
}

/** Cache-first, but only for URLs already in the cache — a miss is never added. */
function handleAsset(event) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(event.request.url).then(function (hit) {
      return hit || fetch(event.request);
    });
  });
}

function handleSession(userId) {
  return caches.open(SESSION_CACHE).then(function (sessions) {
    return sessions.match(SESSION_KEY).then(function (previous) {
      const previousId = previous ? previous.text() : Promise.resolve(null);
      return previousId.then(function (was) {
        // A different person is here. Their pages must never be shown under
        // someone else's session, so the previous user's documents go first.
        const wipe = was && was !== userId ? caches.delete(CACHE_NAME) : Promise.resolve(false);
        return wipe
          .then(function () {
            return sessions.put(SESSION_KEY, new Response(userId));
          })
          .then(precacheDocuments);
      });
    });
  });
}

function pruneOldCaches() {
  return caches.keys().then(function (names) {
    return Promise.all(
      names
        .filter(function (n) {
          return n.indexOf(CACHE_PREFIX) === 0 && n !== CACHE_NAME;
        })
        .map(function (n) {
          return caches.delete(n);
        }),
    );
  });
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('install', function (event) {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener('activate', function (event) {
    event.waitUntil(pruneOldCaches().then(function () {
      return self.clients.claim();
    }));
  });

  self.addEventListener('fetch', function (event) {
    const decision = route(event.request, new URL(event.request.url), self.location.origin);
    if (decision === 'PASS') return;
    if (decision === 'DOCUMENT') event.respondWith(handleDocument(event));
    else if (decision === 'OFFLINE_PAGE') event.respondWith(handleOtherNavigation(event));
    else if (decision === 'ASSET') event.respondWith(handleAsset(event));
  });

  self.addEventListener('message', function (event) {
    const data = event.data || {};
    if (data.type === 'MIS_SESSION' && typeof data.userId === 'string' && data.userId) {
      event.waitUntil(handleSession(data.userId));
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ALLOWED_DOCUMENTS: ALLOWED_DOCUMENTS,
    CACHE_NAME: CACHE_NAME,
    SESSION_CACHE: SESSION_CACHE,
    NAVIGATION_TIMEOUT_MS: NAVIGATION_TIMEOUT_MS,
    route: route,
    extractAssetUrls: extractAssetUrls,
    extractFontUrls: extractFontUrls,
    isCacheableDocument: isCacheableDocument,
    offlinePageHtml: offlinePageHtml,
  };
}
