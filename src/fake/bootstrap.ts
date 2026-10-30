import type { RitualDependencies } from "../ritual/plan.js";
import type { RecordedVoiceSource } from "../ritual/steps.js";
import { createFakeWorker } from "./fake-worker.js";

/** `?fake-models` asks for the fake worker. Only main.ts, in a test-mode build, acts on it. */
export function fakeModelsRequested(search: string): boolean {
  return new URLSearchParams(search).has("fake-models");
}

const fakeCredit = "Fake recording for tests; not a real model output.";

const fakeRecordedVoices: RecordedVoiceSource = {
  hasRecordings: true,
  lookup: (ancestorId, questionId) => ({
    text: `Fake recording of ${ancestorId} for ${questionId}.`,
    credit: fakeCredit,
  }),
  lookupMedium: (questionId) => ({
    text: `Fake recording of the medium for ${questionId}.`,
    credit: fakeCredit,
  }),
};

const noFakeRecordings: RecordedVoiceSource = {
  hasRecordings: false,
  lookup: () => null,
  lookupMedium: () => null,
};

/**
 * Optional URL knobs for e2e: `fake-delay=<ms>` slows the tokens, `fake-fail=<id,id>` makes
 * those models fail while answering, `fake-no-recordings` empties the recordings, and
 * `detect-gpu` makes the page honour real WebGPU detection (otherwise the fake run assumes it).
 */
export function createFakeDependencies(
  search: string,
  detectedWebGpu: boolean,
): RitualDependencies {
  const params = new URLSearchParams(search);
  const delay = Number(params.get("fake-delay") ?? "0");
  const failing = (params.get("fake-fail") ?? "").split(",").filter((id) => id !== "");
  return {
    worker: createFakeWorker({
      tokenDelayMs: Number.isFinite(delay) && delay >= 0 ? delay : 0,
      failGenerate: failing,
      alternativesFor: ["gpt-2"],
    }),
    recorded: params.has("fake-no-recordings") ? noFakeRecordings : fakeRecordedVoices,
    includeMedium: true,
    webgpu: params.has("detect-gpu") ? detectedWebGpu : true,
  };
}
