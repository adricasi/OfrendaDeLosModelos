/**
 * The page's CSP requires Trusted Types for scripts (`require-trusted-types-for 'script'`).
 * `new Worker(url)` and `navigator.serviceWorker.register(url)` are such sinks: a plain string is
 * refused. The CSP allows exactly one policy name, so one policy serves both, and it vouches for
 * exactly two things: the URL of the site's own inference worker and the URL of the site's own
 * service worker (`sw.js`). Each URL is added by its own function after a same-origin check; the
 * policy throws for anything else, so it cannot be used to start a script from elsewhere.
 */
interface TrustedPolicy {
  createScriptURL(input: string): unknown;
}
interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createScriptURL(input: string): string }): TrustedPolicy;
}

export const WORKER_POLICY_NAME = "ofrenda-worker";

interface PolicyState {
  readonly policy: TrustedPolicy;
  readonly allowed: Set<string>;
}

// A policy name can be created once per page, so the policy is kept per factory.
const policies = new WeakMap<TrustedTypesFactory, PolicyState>();

function policyFor(factory: TrustedTypesFactory): PolicyState {
  const existing = policies.get(factory);
  if (existing !== undefined) return existing;
  const allowed = new Set<string>();
  const policy = factory.createPolicy(WORKER_POLICY_NAME, {
    createScriptURL(input: string): string {
      if (!allowed.has(input)) throw new TypeError("Only this site's own workers may be started.");
      return input;
    },
  });
  const state: PolicyState = { policy, allowed };
  policies.set(factory, state);
  return state;
}

function vouch(url: URL, factory: TrustedTypesFactory | undefined, origin: string): string {
  if (url.origin !== origin) throw new Error("The worker script must come from this site.");
  if (factory === undefined) return url.href;
  const state = policyFor(factory);
  state.allowed.add(url.href);
  // The browser's TrustedScriptURL object is accepted wherever a script URL string is.
  return state.policy.createScriptURL(url.href) as string;
}

function defaultFactory(): TrustedTypesFactory | undefined {
  return (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes;
}

/** The value to give `new Worker(...)`: a TrustedScriptURL where the browser has Trusted Types. */
export function workerScriptUrl(
  workerUrl: URL,
  factory: TrustedTypesFactory | undefined = defaultFactory(),
  origin: string = globalThis.location.origin,
): string {
  return vouch(workerUrl, factory, origin);
}

/** The value to give `serviceWorker.register(...)`; only a script named `sw.js` is accepted. */
export function serviceWorkerScriptUrl(
  serviceWorkerUrl: URL,
  factory: TrustedTypesFactory | undefined = defaultFactory(),
  origin: string = globalThis.location.origin,
): string {
  if (!serviceWorkerUrl.pathname.endsWith("/sw.js")) {
    throw new Error("Only the site's service worker (sw.js) may be registered.");
  }
  return vouch(serviceWorkerUrl, factory, origin);
}
