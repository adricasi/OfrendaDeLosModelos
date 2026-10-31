/** Shared by the build (precache.ts) and the service worker (routing.ts); no imports. */
export const CACHE_PREFIX = "ofrenda-shell-";

/** The service worker's own file is never precached: the browser updates it by itself. */
export const SERVICE_WORKER_FILE = "sw.js";
