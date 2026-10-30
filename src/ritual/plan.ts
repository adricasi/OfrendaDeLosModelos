import type { Ancestor } from "../data/validate.js";
import type { ModelWorkerPort } from "../worker/protocol.js";
import { RecordedVoiceStep, WorkerVoiceStep, type RecordedVoiceSource } from "./steps.js";
import type { RitualStep } from "./types.js";

export const MEDIUM_STEP_ID = "medium";
export const MEDIUM_MODEL_ID = "gemma-4-e2b";
/** The only ancestor that still speaks live when the browser has no WebGPU (REQ-010). */
export const WASM_LIVE_ANCESTOR_ID = "gpt-2";

export interface RitualDependencies {
  readonly worker: ModelWorkerPort;
  readonly recorded: RecordedVoiceSource;
  /** False until the medium exists (T-006): the ritual then ends after Gemma 4. */
  readonly includeMedium: boolean;
  /**
   * False when the browser has no WebGPU (REQ-010): GPT-2 runs on WebAssembly, Gemma 4 and the
   * medium are replayed from the recordings. Defaults to true.
   */
  readonly webgpu?: boolean;
}

const MEDIUM_NAME = "La que cuida el altar";

/**
 * The fixed order: ancestors as listed in ancestors.json (GPT-2 live, the recorded
 * Gemmas by age, Gemma 4 live), then the medium. The last live ancestor is Gemma 4: if it
 * fails the ritual ends without the medium (AC-006.4).
 */
export function buildRitualPlan(
  ancestors: readonly Ancestor[],
  deps: RitualDependencies,
): RitualStep[] {
  const webgpu = deps.webgpu !== false;
  const lastLiveId = ancestors.filter((a) => a.kind === "live").at(-1)?.id;
  const steps: RitualStep[] = ancestors.map((ancestor): RitualStep => {
    const info = {
      id: ancestor.id,
      name: ancestor.name,
      ancestorId: ancestor.id,
      mode: ancestor.kind,
    } as const;
    if (ancestor.kind === "recorded") return new RecordedVoiceStep(info, deps.recorded);
    if (!webgpu && ancestor.id !== WASM_LIVE_ANCESTOR_ID) {
      // AC-010.1, AC-006.3: Gemma 4 cannot run here, so its recorded answer is replayed.
      return new RecordedVoiceStep({ ...info, mode: "recorded" }, deps.recorded);
    }
    return new WorkerVoiceStep(info, {
      modelId: ancestor.id,
      worker: deps.worker,
      settings: ancestor.settings,
      endsRitualOnFailure: ancestor.id === lastLiveId && webgpu,
      ...(webgpu ? {} : { backend: "wasm" as const }),
    });
  });
  if (!webgpu) {
    // Without WebGPU the medium never runs live, whatever `includeMedium` says: its words are
    // always replayed from the recordings (so this step exists even before T-006 lands).
    // AC-007.5: the medium's recorded words, for offered questions only, labelled as recorded.
    steps.push(
      new RecordedVoiceStep(
        {
          id: MEDIUM_STEP_ID,
          name: MEDIUM_NAME,
          nameLang: "es",
          ancestorId: null,
          mode: "recorded",
        },
        deps.recorded,
      ),
    );
  } else if (deps.includeMedium) {
    steps.push(
      new WorkerVoiceStep(
        {
          id: MEDIUM_STEP_ID,
          name: MEDIUM_NAME,
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
