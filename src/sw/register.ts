import { serviceWorkerScriptUrl, type KnownScripts } from "../worker/trusted-worker.js";

/**
 * Registers the service worker (T-008, REQ-011) and resolves to `true` once it is active, which
 * means the shell is precached and the altar will open offline. Resolves to `false` (never
 * throws) where offline support is not wanted or not possible: dev builds, insecure contexts,
 * browsers without service workers, or a failed registration.
 */
export interface OfflineShellOptions {
  readonly serviceWorker: ServiceWorkerContainer | undefined;
  readonly production: boolean;
  readonly secureContext: boolean;
  /** The site's base path, e.g. "/OfrendaDeLosModelos/": the worker's scope. */
  readonly base: string;
  readonly known: KnownScripts;
  readonly log?: (message: string, error: unknown) => void;
}

export async function registerOfflineShell(options: OfflineShellOptions): Promise<boolean> {
  const { serviceWorker, production, secureContext, base, known } = options;
  if (!production || !secureContext || serviceWorker === undefined) return false;
  try {
    await serviceWorker.register(serviceWorkerScriptUrl(known), { scope: base });
    await serviceWorker.ready;
    return true;
  } catch (error: unknown) {
    options.log?.("[ofrenda] the service worker could not start; no offline support", error);
    return false;
  }
}
