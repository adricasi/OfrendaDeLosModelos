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

export interface PrecacheManifest {
  /** Changes whenever any precached file changes. */
  readonly version: string;
  readonly cacheName: string;
  /** Sorted, unique paths relative to the base. Always contains `index.html`. */
  readonly entries: readonly string[];
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
  const entries = [...digests.keys()].sort();
  const overall = createHash("sha256");
  for (const entry of entries) overall.update(`${entry}\0${digests.get(entry) ?? ""}\n`);
  const version = overall.digest("hex").slice(0, 16);
  return { version, cacheName: `${CACHE_PREFIX}${version}`, entries };
}
