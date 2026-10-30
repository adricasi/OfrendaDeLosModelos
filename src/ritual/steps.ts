import type {
  GenerationSettings,
  InferenceBackend,
  ModelSource,
  ModelWorkerPort,
  WorkerToUiMessage,
} from "../worker/protocol.js";
import type {
  Question,
  RecordedAnswer,
  RitualStep,
  SpokenOutcome,
  StepContext,
  StepInfo,
} from "./types.js";

export function abortError(): Error {
  return new DOMException("The ritual was stopped.", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Where recorded answers come from; the real source (T-005) reads recorded-voices.json. */
export interface RecordedVoiceSource {
  /** `language` is the offered question's language; a source may fall back to another. */
  lookup(
    ancestorId: string,
    questionId: string,
    language?: "en" | "es" | null,
  ): RecordedAnswer | null;
  /** The medium's recorded words for an offered question (AC-007.5). */
  lookupMedium?(questionId: string, language?: "en" | "es" | null): RecordedAnswer | null;
  /** False when nothing has been recorded yet: steps then say so instead of failing. */
  readonly hasRecordings?: boolean;
}

export const noRecordedVoices: RecordedVoiceSource = { lookup: () => null };

/** AC-005.1, AC-005.3, AC-005.4: replays recordings for offered questions only, unedited. */
export class RecordedVoiceStep implements RitualStep {
  readonly endsRitualOnFailure = false;

  constructor(
    readonly info: StepInfo,
    private readonly source: RecordedVoiceSource,
  ) {}

  run(context: StepContext): Promise<SpokenOutcome> {
    if (context.signal.aborted) return Promise.reject(abortError());
    const { offeredId } = context.question;
    if (offeredId === null) return Promise.resolve({ kind: "not-invited" });
    const { lang } = context.question;
    const answer =
      this.info.ancestorId === null
        ? (this.source.lookupMedium?.(offeredId, lang) ?? null)
        : this.source.lookup(this.info.ancestorId, offeredId, lang);
    if (answer === null) {
      if (this.source.hasRecordings === false) return Promise.resolve({ kind: "gathering" });
      // A missing recording is a failure of this ancestor, isolated like any other.
      return Promise.reject(new Error("No recording for this question."));
    }
    return Promise.resolve({ kind: "recorded", text: answer.text, credit: answer.credit });
  }
}

export interface WorkerVoiceOptions {
  readonly modelId: string;
  readonly worker: ModelWorkerPort;
  readonly settings: GenerationSettings | null;
  /** Where the worker loads the model from; absent for models that are not ready (AC-003.3). */
  readonly source?: ModelSource;
  readonly endsRitualOnFailure: boolean;
  /** Set to "wasm" when the browser has no WebGPU (REQ-010). */
  readonly backend?: InferenceBackend;
  readonly buildPrompt?: (question: Question) => string;
}

let requestCounter = 0;

/** A live step: loads a model in the worker, streams its tokens, resolves with the full text. */
export class WorkerVoiceStep implements RitualStep {
  readonly endsRitualOnFailure: boolean;

  constructor(
    readonly info: StepInfo,
    private readonly options: WorkerVoiceOptions,
  ) {
    this.endsRitualOnFailure = options.endsRitualOnFailure;
  }

  run(context: StepContext): Promise<SpokenOutcome> {
    const { worker, modelId, settings } = this.options;
    const { signal } = context;
    if (signal.aborted) return Promise.reject(abortError());
    requestCounter += 1;
    const requestId = `${this.info.id}-${String(requestCounter)}`;
    const prompt = (this.options.buildPrompt ?? ((q: Question) => q.text))(context.question);

    return new Promise<SpokenOutcome>((resolve, reject) => {
      let text = "";
      let generating = false;
      let settled = false;

      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        unsubscribe();
        signal.removeEventListener("abort", onAbort);
        action();
      };
      const onAbort = (): void => {
        worker.post(generating ? { type: "cancel", requestId } : { type: "cancel-load", modelId });
        finish(() => {
          reject(abortError());
        });
      };
      const fail = (message: string): void => {
        finish(() => {
          reject(new Error(message));
        });
      };
      const onMessage = (message: WorkerToUiMessage): void => {
        switch (message.type) {
          case "progress":
            if (message.modelId === modelId) context.reportProgress(message.loaded, message.total);
            break;
          case "ready":
            if (message.modelId === modelId && !generating) {
              generating = true;
              worker.post({ type: "generate", requestId, modelId, prompt, settings });
            }
            break;
          case "token":
            if (message.requestId === requestId) {
              text += message.text;
              context.emitToken(
                message.alternatives === undefined
                  ? { text: message.text }
                  : { text: message.text, alternatives: message.alternatives },
              );
            }
            break;
          case "done":
            if (message.requestId === requestId) {
              finish(() => {
                resolve({ kind: "spoken", text });
              });
            }
            break;
          case "error":
            // An error naming neither a request nor a model is a failure of the worker itself.
            if (
              message.requestId === requestId ||
              message.modelId === modelId ||
              (message.requestId === undefined && message.modelId === undefined)
            ) {
              fail(message.message);
            }
            break;
        }
      };

      const unsubscribe = worker.subscribe(onMessage);
      signal.addEventListener("abort", onAbort, { once: true });
      const { source, backend } = this.options;
      worker.post({
        type: "load",
        modelId,
        ...(source === undefined ? {} : { source }),
        ...(backend === undefined ? {} : { backend }),
      });
    });
  }
}
