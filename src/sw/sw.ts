import { createShell, type ShellManifest } from "./shell.js";

/**
 * The service worker (T-008, REQ-011): offline after the first visit. Hand-written, no library;
 * the behaviour is in shell.ts, this file only connects it to the browser. Built by Vite as its
 * own entry to `sw.js` at the site root (scope = the base path). The build replaces
 * `__PRECACHE__` with the generated manifest (vite.config.ts, `offlineShell`), so the file
 * changes, and the browser installs a new worker, whenever any shell file changes.
 *
 * It never touches cross-origin requests (model files are cached by transformers.js in its own
 * Cache Storage, `transformers-cache`) and stores only the files of the manifest.
 *
 * There is no `skipWaiting()`: a new worker installs in the background and takes over only when
 * every tab of the old one is closed. Until then the old shell (page, hashed files, data) stays
 * in use, so an open tab never mixes builds; unhashed files still ask the network first (see
 * routing.ts), so even the old worker does not serve stale data while online.
 */
declare const __PRECACHE__: ShellManifest;

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

const shell = createShell({
  manifest: __PRECACHE__,
  scope: self.registration.scope,
  caches,
  fetch: (url, init) => fetch(url, init),
  log: (message, detail) => {
    console.warn(message, detail);
  },
});

self.addEventListener("install", (event) => {
  event.waitUntil(shell.install());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(shell.activate().then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const response = shell.handle(event.request);
  if (response !== null) event.respondWith(response);
});
