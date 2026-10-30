import { routeRequest, staleCaches } from "./routing.js";

/**
 * The service worker (T-008, REQ-011): offline after the first visit. Hand-written, no library.
 * Built by Vite as its own entry to `sw.js` at the site root (scope = the base path). The build
 * replaces `__PRECACHE__` with the generated manifest (vite.config.ts, `offlineShell`), so the
 * file changes, and the browser installs a new worker, whenever any shell file changes.
 *
 * It never touches cross-origin requests (model files are cached by transformers.js in its own
 * Cache Storage, `transformers-cache`) and stores only the files of the manifest.
 */
interface Manifest {
  readonly cacheName: string;
  readonly entries: readonly string[];
}
declare const __PRECACHE__: Manifest;

interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}
interface WorkerScope {
  readonly registration: { readonly scope: string };
  readonly clients: { claim(): Promise<void> };
  addEventListener(type: "install" | "activate", listener: (e: ExtendableEventLike) => void): void;
  addEventListener(type: "fetch", listener: (e: FetchEventLike) => void): void;
}
declare const self: WorkerScope;

const { cacheName, entries } = __PRECACHE__;
const precached: ReadonlySet<string> = new Set(entries);
const scope = self.registration.scope;
const indexUrl = new URL("index.html", scope).href;

async function precache(): Promise<void> {
  const cache = await caches.open(cacheName);
  await Promise.all(
    entries.map(async (entry) => {
      // "reload" skips the HTTP cache, so a half-updated deploy is not frozen into the cache.
      const response = await fetch(new URL(entry, scope).href, { cache: "reload" });
      if (!response.ok) throw new Error(`Could not precache ${entry}: ${String(response.status)}`);
      await cache.put(new URL(entry, scope).href, response);
    }),
  );
}

async function activate(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(staleCaches(names, cacheName).map((name) => caches.delete(name)));
  await self.clients.claim();
}

async function navigation(request: Request): Promise<Response> {
  try {
    // Nothing is stored here: the cached shell changes only when a new worker installs, so its
    // HTML and its hashed files always belong together.
    return await fetch(request);
  } catch (error: unknown) {
    const cached = await (await caches.open(cacheName)).match(indexUrl);
    if (cached === undefined) throw error;
    return cached;
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await (await caches.open(cacheName)).match(request.url);
  return cached ?? fetch(request);
}

// A new worker waits until the old one's tabs are closed (no skipWaiting): an open page keeps
// the hashed files it was built with.
self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(activate());
});
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const route = routeRequest(request, scope, precached);
  if (route === "navigation") event.respondWith(navigation(request));
  else if (route === "precached") event.respondWith(cacheFirst(request));
});
