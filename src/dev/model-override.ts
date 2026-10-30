import type { Ancestor } from "../data/validate.js";

/**
 * Development only: `?model-gpt2=<repository>@<revision>` (and `?model-gemma4=…` for Gemma 4 E2B) lets the builder try a model before
 * its repository and revision are pinned in ancestors.json. Only main.ts imports this, behind
 * `import.meta.env.DEV`, so the production build contains neither this code nor the parameter
 * name (test/model-override.test.ts checks the bundle). The revision must be a full commit hash.
 */
export interface ModelOverride {
  readonly repositoryId: string;
  readonly revision: string;
}

const OVERRIDE = /^([A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*)@([0-9a-f]{40})$/;

/** Present only in builds that include the override; the production-bundle test looks for it. */
export const MODEL_OVERRIDE_MARKER = "dev-model-override-v1";

/** The parameter name for an ancestor: `gpt-2` is `model-gpt2`, `gemma-4-e2b` is `model-gemma4`. */
export function overrideParameter(ancestorId: string): string {
  if (ancestorId === "gemma-4-e2b") return "model-gemma4";
  return `model-${ancestorId.replaceAll("-", "")}`;
}

export function parseModelOverride(search: string, ancestorId: string): ModelOverride | null {
  const value = new URLSearchParams(search).get(overrideParameter(ancestorId));
  if (value === null) return null;
  const match = OVERRIDE.exec(value);
  const repositoryId = match?.[1];
  const revision = match?.[2];
  return repositoryId === undefined || revision === undefined ? null : { repositoryId, revision };
}

/** The ancestors with any `?model-<id>=` override applied: a copy, the loaded data is untouched. */
export function applyModelOverrides(ancestors: readonly Ancestor[], search: string): Ancestor[] {
  return ancestors.map((ancestor) => {
    const override = parseModelOverride(search, ancestor.id);
    if (override === null) return ancestor;
    console.info(
      `[ofrenda] ${MODEL_OVERRIDE_MARKER}: ${ancestor.id} uses ${override.repositoryId}@${override.revision}`,
    );
    return { ...ancestor, ...override };
  });
}
