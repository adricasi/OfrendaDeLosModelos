import { CACHE_PREFIX } from "./constants.js";

/**
 * Pure decisions of the service worker (T-008, REQ-011), kept apart so they can be tested.
 *
 * - `navigation`: a page load of the altar itself: network first, the cached page if offline.
 * - `cache-first`: a content-hashed file of the manifest (`assets/name-<hash>.js`): one name is
 *   one content, so the cached copy can never be stale.
 * - `network-first`: an unhashed file of the manifest (`data/*.json`, `ort/*`): the name stays
 *   the same across deploys, so the network wins and the cache is only the offline fallback.
 *   That keeps new code from being paired with old data or old ONNX Runtime files after a deploy.
 * - `ignore`: everything else, which the service worker never touches (no `respondWith`):
 *   cross-origin requests (model downloads are handled by transformers.js in its own Cache
 *   Storage), non-GET requests, anything with a query string, and any path not in the manifest.
 *   Only manifest files are ever stored, so nothing that could contain visitor input is cached.
 */
export type Route = "navigation" | "cache-first" | "network-first" | "ignore";

export type FileKind = "hashed" | "unhashed";

export interface RouteRequest {
  readonly method: string;
  readonly url: string;
  readonly mode: string;
}

/** `scope` is the service worker's scope URL (the site's base), ending in "/". */
export function routeRequest(
  request: RouteRequest,
  scope: string,
  files: ReadonlyMap<string, FileKind>,
): Route {
  if (request.method !== "GET") return "ignore";
  const url = new URL(request.url);
  const base = new URL(scope);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return "ignore";
  const relative = url.pathname.slice(base.pathname.length);
  if (request.mode === "navigate") {
    // A query such as ?debug or ?fake-models is read by the page's own script (location.search)
    // and selects behaviour only; the HTML is the same file whatever the query. So answering
    // such a navigation with the cached index.html when offline is correct, and the query is
    // never stored, sent or used as a cache key.
    return relative === "" || relative === "index.html" ? "navigation" : "ignore";
  }
  if (url.search !== "") return "ignore";
  const kind = files.get(relative);
  if (kind === undefined) return "ignore";
  return kind === "hashed" ? "cache-first" : "network-first";
}

/** Caches this worker made for earlier builds; nothing else (transformers.js's cache) is touched. */
export function staleCaches(names: readonly string[], current: string): string[] {
  return names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current);
}
