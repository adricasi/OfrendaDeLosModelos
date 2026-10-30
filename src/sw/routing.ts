import { CACHE_PREFIX } from "./constants.js";

/**
 * Pure decisions of the service worker (T-008, REQ-011), kept apart so they can be tested.
 *
 * - `navigation`: a page load of the altar itself: network first, the cached shell if offline.
 * - `precached`: a file listed in the build's manifest: cache first.
 * - `ignore`: everything else, which the service worker never touches (no `respondWith`):
 *   cross-origin requests (model downloads are handled by transformers.js in its own Cache
 *   Storage), non-GET requests, anything with a query string, and any path not in the manifest.
 *   Only manifest files are ever stored, so nothing that could contain visitor input is cached.
 */
export type Route = "navigation" | "precached" | "ignore";

export interface RouteRequest {
  readonly method: string;
  readonly url: string;
  readonly mode: string;
}

/** `scope` is the service worker's scope URL (the site's base), ending in "/". */
export function routeRequest(
  request: RouteRequest,
  scope: string,
  precached: ReadonlySet<string>,
): Route {
  if (request.method !== "GET") return "ignore";
  const url = new URL(request.url);
  const base = new URL(scope);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return "ignore";
  const relative = url.pathname.slice(base.pathname.length);
  if (request.mode === "navigate") {
    // The query (for example ?fake-models) selects behaviour and is never stored.
    return relative === "" || relative === "index.html" ? "navigation" : "ignore";
  }
  if (url.search !== "") return "ignore";
  return precached.has(relative) ? "precached" : "ignore";
}

/** Caches this worker made for earlier builds; nothing else (transformers.js's cache) is touched. */
export function staleCaches(names: readonly string[], current: string): string[] {
  return names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current);
}
