import type { Ancestor } from "../data/validate.js";
import type { ModelWorkerPort } from "../worker/protocol.js";
import { RecordedVoiceStep, WorkerVoiceStep, type RecordedVoiceSource } from "./steps.js";
import type { RitualStep, StepInfo } from "./types.js";

export const GPT2_ID = "gpt-2";
export const UNFILTERED_LABEL = "Unfiltered 2019 model";
export const MEDIUM_STEP_ID = "medium";
export const MEDIUM_MODEL_ID = "gemma-4-e2b";

export interface RitualDependencies {
  readonly worker: ModelWorkerPort;
  readonly recorded: RecordedVoiceSource;
  /** False until the medium exists (T-006): the ritual then ends after Gemma 4. */
  readonly includeMedium: boolean;
}

/**
 * The fixed order: ancestors as listed in ancestors.json (GPT-2 live, the recorded
 * Gemmas by age, Gemma 4 live), then the medium. The last live ancestor is Gemma 4: if it
 * fails the ritual ends without the medium (AC-006.4).
 */
export function buildRitualPlan(
  ancestors: readonly Ancestor[],
  deps: RitualDependencies,
): RitualStep[] {
  const lastLiveId = ancestors.filter((a) => a.kind === "live").at(-1)?.id;
  const steps: RitualStep[] = ancestors.map((ancestor): RitualStep => {
    const info: StepInfo = {
      id: ancestor.id,
      name: ancestor.name,
      ancestorId: ancestor.id,
      mode: ancestor.kind,
      ...(ancestor.id === GPT2_ID ? { caveat: UNFILTERED_LABEL } : {}),
    };
    if (ancestor.kind === "recorded") return new RecordedVoiceStep(info, deps.recorded);
    return new WorkerVoiceStep(info, {
      modelId: ancestor.id,
      worker: deps.worker,
      settings: ancestor.settings,
      source: {
        repositoryId: ancestor.repositoryId,
        revision: ancestor.revision,
        dtypes: ancestor.dtypes,
      },
      endsRitualOnFailure: ancestor.id === lastLiveId,
    });
  });
  if (deps.includeMedium) {
    steps.push(
      new WorkerVoiceStep(
        {
          id: MEDIUM_STEP_ID,
          name: "La que cuida el altar",
          nameLang: "es",
          ancestorId: null,
          mode: "medium",
        },
        {
          modelId: MEDIUM_MODEL_ID,
          worker: deps.worker,
          settings: null,
          endsRitualOnFailure: false,
        },
      ),
    );
  }
  return steps;
}
