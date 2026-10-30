/**
 * The page's CSP requires Trusted Types for scripts (`require-trusted-types-for 'script'`), and
 * `new Worker(url)` is such a sink: a plain string is refused. This policy vouches for exactly
 * one thing, the URL of the site's own inference worker, and throws for anything else, so it
 * cannot be used to start a script from elsewhere.
 */
interface TrustedPolicy {
  createScriptURL(input: string): unknown;
}
interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createScriptURL(input: string): string }): TrustedPolicy;
}

export const WORKER_POLICY_NAME = "ofrenda-worker";

/** The value to give `new Worker(...)`: a TrustedScriptURL where the browser has Trusted Types. */
export function workerScriptUrl(
  workerUrl: URL,
  factory: TrustedTypesFactory | undefined = (globalThis as { trustedTypes?: TrustedTypesFactory })
    .trustedTypes,
  origin: string = globalThis.location.origin,
): string {
  if (workerUrl.origin !== origin) throw new Error("The worker script must come from this site.");
  if (factory === undefined) return workerUrl.href;
  const allowed = workerUrl.href;
  const policy = factory.createPolicy(WORKER_POLICY_NAME, {
    createScriptURL(input: string): string {
      if (input !== allowed) throw new TypeError("Only the inference worker may be started.");
      return input;
    },
  });
  // The browser's TrustedScriptURL object is accepted wherever a script URL string is.
  return policy.createScriptURL(allowed) as string;
}
