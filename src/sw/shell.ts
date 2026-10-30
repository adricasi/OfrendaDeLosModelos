import { routeRequest, staleCaches, type FileKind } from "./routing.js";

/**
 * The service worker's behaviour (T-008, REQ-011) with its environment injected, so the tests can
 * run two builds against in-memory caches. `sw.ts` wires it to the real `caches` and `fetch`.
 */
export interface ManifestEntry {
  readonly path: string;
  readonly digest: string;
  readonly hashed: boolean;
}

export interface ShellManifest {
  readonly cacheName: string;
  readonly entries: readonly ManifestEntry[];
}

export interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
}

export interface CachesLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

export interface ShellEnvironment {
  readonly manifest: ShellManifest;
  /** The service worker's scope URL, ending in "/". */
  readonly scope: string;
  readonly caches: CachesLike;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly log: (message: string, detail?: unknown) => void;
}

/** Stored with every cached file so a later build can copy it instead of downloading it again. */
export const DIGEST_HEADER = "x-ofrenda-digest";

function withDigest(response: Response, digest: string): Response {
  const headers = new Headers(response.headers);
  headers.set(DIGEST_HEADER, digest);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export interface Shell {
  install(): Promise<void>;
  activate(): Promise<void>;
  /** The response for a request, or null when the worker must not touch it. */
  handle(request: RouteRequestLike): Promise<Response> | null;
}

export interface RouteRequestLike {
  readonly method: string;
  readonly url: string;
  readonly mode: string;
}

export function createShell(env: ShellEnvironment): Shell {
  const { manifest, scope, caches, log } = env;
  const kinds = new Map<string, FileKind>(
    manifest.entries.map((entry) => [entry.path, entry.hashed ? "hashed" : "unhashed"] as const),
  );
  const indexUrl = new URL("index.html", scope).href;
  const own = (): Promise<CacheLike> => caches.open(manifest.cacheName);

  async function copyFromEarlierBuild(
    earlier: CacheLike[],
    url: string,
    digest: string,
  ): Promise<Response | undefined> {
    for (const cache of earlier) {
      const found = await cache.match(url);
      if (found?.headers.get(DIGEST_HEADER) === digest) return found;
    }
    return undefined;
  }

  return {
    async install(): Promise<void> {
      const cache = await own();
      const earlierNames = staleCaches(await caches.keys(), manifest.cacheName);
      const earlier = await Promise.all(earlierNames.map((name) => caches.open(name)));
      const failed: string[] = [];
      await Promise.all(
        manifest.entries.map(async ({ path, digest }) => {
          const url = new URL(path, scope).href;
          try {
            // Unchanged files come from the previous build's cache: a deploy that changes a
            // few files does not download the 27 MB ONNX Runtime binary again.
            const reused = await copyFromEarlierBuild(earlier, url, digest);
            if (reused !== undefined) {
              await cache.put(url, reused);
              return;
            }
            // "reload" skips the HTTP cache, so a half-updated deploy is not frozen in.
            const response = await env.fetch(url, { cache: "reload" });
            if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
            await cache.put(url, withDigest(response, digest));
          } catch (error: unknown) {
            failed.push(path);
            log(`[ofrenda] could not precache ${path}`, error);
          }
        }),
      );
      if (failed.length > 0) {
        // An incomplete cache is never activated. The previous worker, if any, stays, and stays
        // correct: it asks the network first for every file whose name does not carry a hash.
        await caches.delete(manifest.cacheName);
        throw new Error(`Could not precache: ${failed.join(", ")}`);
      }
    },

    async activate(): Promise<void> {
      const names = await caches.keys();
      await Promise.all(staleCaches(names, manifest.cacheName).map((name) => caches.delete(name)));
    },

    handle(request): Promise<Response> | null {
      const route = routeRequest(request, scope, kinds);
      if (route === "ignore") return null;
      return (async (): Promise<Response> => {
        const cache = await own();
        if (route === "cache-first") {
          return (await cache.match(request.url)) ?? env.fetch(request.url);
        }
        // Nothing is stored here: the cache changes only when a worker installs, so the page,
        // its hashed files and its data in one cache always belong to one build.
        const lookup = route === "navigation" ? indexUrl : request.url;
        try {
          const response = await env.fetch(
            request.url,
            route === "network-first" ? { cache: "no-cache" } : undefined,
          );
          if (response.ok) return response;
          return (await cache.match(lookup)) ?? response;
        } catch (error: unknown) {
          const cached = await cache.match(lookup);
          if (cached === undefined) throw error;
          return cached;
        }
      })();
    },
  };
}
