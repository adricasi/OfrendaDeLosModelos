/**
 * The page's CSP requires Trusted Types for scripts (`require-trusted-types-for 'script'`).
 * `new Worker(url)` and `navigator.serviceWorker.register(url)` are such sinks: a plain string is
 * refused. The CSP allows exactly one policy name, so one policy serves both, and it vouches for
 * exactly two URLs, compared as whole strings (no prefix, suffix or "same origin" rule, because a
 * GitHub Pages origin is shared with the owner's other sites):
 * - the inference worker: the one URL the build produced for it;
 * - the service worker: `<origin><base>sw.js`.
 * It throws for anything else, so it cannot be used to start a script from elsewhere.
 */
interface TrustedPolicy {
  createScriptURL(input: string): unknown;
}
interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createScriptURL(input: string): string }): TrustedPolicy;
}

export const WORKER_POLICY_NAME = "ofrenda-worker";

/** The two script URLs (absolute, as hrefs) this page may start. */
export interface KnownScripts {
  readonly inferenceWorker: string;
  readonly serviceWorker: string;
}

/**
 * `builtWorkerUrl` is the inference worker's URL as the build resolved it; `base` is the site's
 * base path ("/OfrendaDeLosModelos/"). Both must be on `origin`.
 */
export function knownScripts(
  builtWorkerUrl: string,
  base: string,
  origin: string = globalThis.location.origin,
): KnownScripts {
  const inferenceWorker = new URL(builtWorkerUrl, origin);
  if (inferenceWorker.origin !== origin)
    throw new Error("The worker script must come from this site.");
  return {
    inferenceWorker: inferenceWorker.href,
    serviceWorker: new URL(`${base}sw.js`, origin).href,
  };
}

const policies = new WeakMap<TrustedTypesFactory, TrustedPolicy>();

function policyFor(factory: TrustedTypesFactory, known: KnownScripts): TrustedPolicy {
  // A policy name can be created once per page, so the policy is kept per factory.
  const existing = policies.get(factory);
  if (existing !== undefined) return existing;
  const policy = factory.createPolicy(WORKER_POLICY_NAME, {
    createScriptURL(input: string): string {
      if (input !== known.inferenceWorker && input !== known.serviceWorker) {
        throw new TypeError("Only this site's own workers may be started.");
      }
      return input;
    },
  });
  policies.set(factory, policy);
  return policy;
}

function defaultFactory(): TrustedTypesFactory | undefined {
  return (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes;
}

function vouch(url: string, known: KnownScripts, factory: TrustedTypesFactory | undefined): string {
  if (factory === undefined) return url;
  // The browser's TrustedScriptURL object is accepted wherever a script URL string is.
  return policyFor(factory, known).createScriptURL(url) as string;
}

/** The value to give `new Worker(...)`: a TrustedScriptURL where the browser has Trusted Types. */
export function workerScriptUrl(
  known: KnownScripts,
  factory: TrustedTypesFactory | undefined = defaultFactory(),
): string {
  return vouch(known.inferenceWorker, known, factory);
}

/** The value to give `serviceWorker.register(...)`. */
export function serviceWorkerScriptUrl(
  known: KnownScripts,
  factory: TrustedTypesFactory | undefined = defaultFactory(),
): string {
  return vouch(known.serviceWorker, known, factory);
}
