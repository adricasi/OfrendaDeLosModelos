import type { Ancestor } from "../data/validate.js";
import type { ModelSource, ModelWorkerPort } from "../worker/protocol.js";
import { buildAnswerPrompt, buildMediumPrompt } from "../medium/prompt-source.js";
import {
  MEDIUM_RETRY_BUDGET_MS,
  MediumStep,
  RecordedVoiceStep,
  WorkerVoiceStep,
  type RecordedVoiceSource,
} from "./steps.js";
import type { RitualStep, StepInfo } from "./types.js";

export const GPT2_ID = "gpt-2";
export const UNFILTERED_LABEL = "Unfiltered 2019 model";
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

/** AC-006.3: said in Gemma 4's place when the visitor declines the download for their own question. */
export const GEMMA4_WAITING_MESSAGE =
  "Gemma 4 is waiting to be invited: it answers your own question on your device once you allow the download.";

/**
 * The medium writes up to six entries as JSON, so it gets a larger budget than an answer.
 * A lower temperature keeps the JSON well formed (unverified until the real-model check).
 */
const MEDIUM_SETTINGS = { maxTokens: 1100, temperature: 0.5 } as const;

function sourceOf(ancestor: Ancestor): ModelSource {
  return {
    repositoryId: ancestor.repositoryId,
    revision: ancestor.revision,
    dtypes: ancestor.dtypes,
  };
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
  const webgpu = deps.webgpu !== false;
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
    if (!webgpu && ancestor.id !== WASM_LIVE_ANCESTOR_ID) {
      // AC-010.1, AC-006.3: Gemma 4 cannot run here, so its recorded answer is replayed.
      return new RecordedVoiceStep({ ...info, mode: "recorded" }, deps.recorded);
    }
    return new WorkerVoiceStep(info, {
      modelId: ancestor.id,
      worker: deps.worker,
      settings: ancestor.settings,
      source: sourceOf(ancestor),
      endsRitualOnFailure: ancestor.id === lastLiveId && webgpu,
      ...(webgpu ? {} : { backend: "wasm" as const }),
      ...(ancestor.id === MEDIUM_MODEL_ID
        ? {
            // AC-006.1, AC-006.2, AC-006.3: its own answer, with consent before a download.
            buildPrompt: (context) =>
              buildAnswerPrompt({
                question: context.question.text,
                language: context.question.lang,
              }),
            consent: {
              modelName: ancestor.name,
              bytes: ancestor.downloadBytes,
              declined: new RecordedVoiceStep({ ...info, mode: "recorded" }, deps.recorded),
              waitingMessage: GEMMA4_WAITING_MESSAGE,
            },
          }
        : {}),
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
    const gemma = ancestors.find((a) => a.id === MEDIUM_MODEL_ID);
    const recordedMedium = {
      id: MEDIUM_STEP_ID,
      name: MEDIUM_NAME,
      nameLang: "es",
      ancestorId: null,
    } as const;
    steps.push(
      new MediumStep(
        { ...recordedMedium, mode: "medium" },
        {
          modelId: MEDIUM_MODEL_ID,
          worker: deps.worker,
          settings: MEDIUM_SETTINGS,
          ...(gemma === undefined ? {} : { source: sourceOf(gemma) }),
          buildPrompt: buildMediumPrompt,
          // Gemma 4 declined: the recorded medium's words, labelled (AC-007.5).
          fallback: new RecordedVoiceStep({ ...recordedMedium, mode: "recorded" }, deps.recorded),
          retryBudgetMs: MEDIUM_RETRY_BUDGET_MS,
        },
      ),
    );
  }
  return steps;
}
