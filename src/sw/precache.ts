import { createHash } from "node:crypto";

import { CACHE_PREFIX, SERVICE_WORKER_FILE } from "./constants.js";

/**
 * Build-time only (imported by vite.config.ts and tests, never by the service worker): turns the
 * list of files the build produces into the precache manifest embedded in `sw.js` (T-008,
 * REQ-011). The list is generated, never hand-maintained.
 */
export interface PrecacheFile {
  /** Path relative to the site's base, e.g. `assets/index-abc.js`. */
  readonly path: string;
  readonly content: string | Uint8Array;
}

export interface PrecacheEntry {
  readonly path: string;
  /** SHA-256 of the content (hex): lets a new worker copy an unchanged file from the old cache. */
  readonly digest: string;
  /** True when the file name carries a content hash, so one name always means one content. */
  readonly hashed: boolean;
}

export interface PrecacheManifest {
  /** Changes whenever any precached file changes. */
  readonly version: string;
  readonly cacheName: string;
  /** Sorted by path, unique. Always contains `index.html`. */
  readonly entries: readonly PrecacheEntry[];
}

/**
 * Vite names bundled files `assets/<name>-<8 character hash>.<ext>`. Everything else (the page,
 * `data/*.json`, `ort/*`) keeps its name across builds, so a cached copy can be out of date.
 */
export function isContentHashed(path: string): boolean {
  return /^assets\/.+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/.test(path);
}

function checkPath(path: string): void {
  if (path === "" || path.startsWith("/") || path.split("/").includes("..") || /[?#]/.test(path)) {
    throw new Error(`Not a path relative to the site base: "${path}"`);
  }
}

export function buildPrecacheManifest(files: Iterable<PrecacheFile>): PrecacheManifest {
  const digests = new Map<string, string>();
  for (const file of files) {
    checkPath(file.path);
    if (file.path === SERVICE_WORKER_FILE || file.path.endsWith(".map")) continue;
    digests.set(file.path, createHash("sha256").update(file.content).digest("hex"));
  }
  if (!digests.has("index.html")) throw new Error("The precache list has no index.html.");
  const entries = [...digests.keys()].sort().map((path) => ({
    path,
    digest: digests.get(path) ?? "",
    hashed: isContentHashed(path),
  }));
  const overall = createHash("sha256");
  for (const entry of entries) overall.update(`${entry.path}\0${entry.digest}\n`);
  const version = overall.digest("hex").slice(0, 16);
  return { version, cacheName: `${CACHE_PREFIX}${version}`, entries };
}
