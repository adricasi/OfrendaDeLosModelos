import type {
  GenerationSettings,
  InferenceBackend,
  ModelSource,
  ModelWorkerPort,
  WorkerToUiMessage,
} from "../worker/protocol.js";
import { parseMedium } from "../medium/parse.js";
import { retryPrompt, type AncestorWords, type PromptValues } from "../medium/template.js";
import type {
  CompletedStep,
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
    // The recorded medium is JSON: shown per ancestor when it parses, as recorded otherwise.
    const parsed = this.info.ancestorId === null ? parseMedium(answer.text) : null;
    return Promise.resolve({
      kind: "recorded",
      text: answer.text,
      credit: answer.credit,
      ...(parsed?.ok === true ? { notes: parsed.notes } : {}),
    });
  }
}

export interface ConsentOptions {
  /** Name shown in the question, such as "Gemma 4 E2B". */
  readonly modelName: string;
  /** The whole download in bytes, or null while it is unverified. */
  readonly bytes: number | null;
  /** Runs instead of the live voice when the visitor declines (AC-006.3). */
  readonly declined: RitualStep;
  /** Said for a declined own question, which has no recording (AC-006.3). */
  readonly waitingMessage: string;
}

export interface GenerationTarget {
  readonly modelId: string;
  readonly worker: ModelWorkerPort;
  readonly settings: GenerationSettings | null;
  /** Where the worker loads the model from; absent for models that are not ready (AC-003.3). */
  readonly source?: ModelSource;
  /** Set to "wasm" when the browser has no WebGPU (REQ-010). */
  readonly backend?: InferenceBackend;
}

export interface WorkerVoiceOptions extends GenerationTarget {
  readonly endsRitualOnFailure: boolean;
  /** When set, the visitor is asked before a download (AC-006.2). */
  readonly consent?: ConsentOptions;
  /** The text sent to the model; defaults to the question as typed. */
  readonly buildPrompt?: (context: StepContext) => string;
}

let requestCounter = 0;

/** How long to wait for the worker to say whether a model is stored before asking the visitor. */
export const PROBE_TIMEOUT_MS = 3000;

/** Asks the worker whether the model is already on this device; any doubt means "not stored". */
export function probeCached(
  target: GenerationTarget,
  signal: AbortSignal,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const { worker, modelId, source, backend } = target;
  return new Promise<boolean>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const end = (action: () => void): void => {
      clearTimeout(timer);
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = (): void => {
      end(() => {
        reject(abortError());
      });
    };
    const unsubscribe = worker.subscribe((message) => {
      if (message.type === "probed" && message.modelId === modelId) {
        end(() => {
          if (message.refused === undefined) resolve(message.cached);
          else reject(new Error(message.refused));
        });
      }
    });
    const timer = setTimeout(() => {
      end(() => {
        resolve(false);
      });
    }, timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    worker.post({
      type: "probe",
      modelId,
      ...(source === undefined ? {} : { source }),
      ...(backend === undefined ? {} : { backend }),
    });
  });
}

/**
 * Loads a model in the worker (a loaded model answers `ready` at once), generates one answer and
 * resolves with its full text. With `stream` the tokens are shown as they come (AC-006.1);
 * without it only the text is returned (the medium's JSON is not shown while it is written).
 */
export function generateText(
  target: GenerationTarget,
  stepId: string,
  context: StepContext,
  prompt: string,
  stream: boolean,
): Promise<string> {
  const { worker, modelId, settings } = target;
  const { signal } = context;
  if (signal.aborted) return Promise.reject(abortError());
  requestCounter += 1;
  const requestId = `${stepId}-${String(requestCounter)}`;

  return new Promise<string>((resolve, reject) => {
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
            if (stream) {
              context.emitToken(
                message.alternatives === undefined
                  ? { text: message.text }
                  : { text: message.text, alternatives: message.alternatives },
              );
            }
          }
          break;
        case "done":
          if (message.requestId === requestId) {
            finish(() => {
              resolve(text);
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
        default:
          break;
      }
    };

    const unsubscribe = worker.subscribe(onMessage);
    signal.addEventListener("abort", onAbort, { once: true });
    const { source, backend } = target;
    worker.post({
      type: "load",
      modelId,
      ...(source === undefined ? {} : { source }),
      ...(backend === undefined ? {} : { backend }),
    });
  });
}

/** A live step: loads a model in the worker, streams its tokens, resolves with the full text. */
export class WorkerVoiceStep implements RitualStep {
  readonly endsRitualOnFailure: boolean;

  constructor(
    readonly info: StepInfo,
    private readonly options: WorkerVoiceOptions,
  ) {
    this.endsRitualOnFailure = options.endsRitualOnFailure;
  }

  async run(context: StepContext): Promise<SpokenOutcome> {
    const { consent, buildPrompt } = this.options;
    if (context.signal.aborted) throw abortError();
    if (consent !== undefined) {
      // A model that cannot be loaded (no pinned revision) is never offered for download: the
      // probe rejects with the worker's reason.
      const cached = await probeCached(this.options, context.signal);
      if (!cached) {
        const agreed = await context.askConsent({
          modelName: consent.modelName,
          bytes: consent.bytes,
        });
        if (!agreed) {
          const outcome = await consent.declined.run(context);
          return outcome.kind === "not-invited"
            ? { kind: "not-invited", message: consent.waitingMessage }
            : outcome;
        }
      }
    }
    const prompt = buildPrompt === undefined ? context.question.text : buildPrompt(context);
    const text = await generateText(this.options, this.info.id, context, prompt, true);
    return { kind: "spoken", text };
  }
}

/** What the medium reads of each ancestor: the words it spoke or that were recorded. */
export function collectAncestorWords(previous: readonly CompletedStep[]): AncestorWords[] {
  return previous.flatMap((step): AncestorWords[] => {
    const { outcome, info } = step;
    if (info.ancestorId === null) return [];
    if (outcome.kind !== "spoken" && outcome.kind !== "recorded") return [];
    return outcome.text.trim() === ""
      ? []
      : [{ ancestorId: info.ancestorId, name: info.name, text: outcome.text }];
  });
}

export interface MediumOptions extends GenerationTarget {
  readonly buildPrompt: (values: PromptValues) => string;
  /** Used when Gemma 4 did not speak live (declined, no WebGPU): the recorded words (AC-007.5). */
  readonly fallback: RitualStep;
  /** A retry with the validation error only happens when the first try took less than this. */
  readonly retryBudgetMs: number;
  readonly now?: () => number;
}

/** NFR-004: the medium completes within 120 s, so a second try needs time to spare. */
export const MEDIUM_RETRY_BUDGET_MS = 45_000;

/**
 * La que cuida el altar (REQ-007): Gemma 4, already loaded for its own answer, writes the meaning
 * and a calaverita for each ancestor as JSON. The reply is validated (AC-007.1, AC-007.3); one
 * retry with the validation error when there is time; otherwise the text it produced is shown as
 * one message (AC-007.4).
 */
export class MediumStep implements RitualStep {
  readonly endsRitualOnFailure = false;

  constructor(
    readonly info: StepInfo,
    private readonly options: MediumOptions,
  ) {}

  async run(context: StepContext): Promise<SpokenOutcome> {
    const { modelId, fallback, retryBudgetMs } = this.options;
    const gemma = context.previous.find((step) => step.info.id === modelId);
    // Without Gemma 4 live on this device the medium cannot write: replay its recorded words.
    if (gemma?.outcome.kind !== "spoken") return fallback.run(context);
    const words = collectAncestorWords(context.previous);
    if (words.length === 0) throw new Error("No ancestor has spoken, so there is nothing to tend.");
    const ids = words.map((w) => w.ancestorId);
    const prompt = this.options.buildPrompt({
      question: context.question.text,
      language: context.question.lang,
      answers: words,
    });
    const now = this.options.now ?? Date.now;
    context.reportStatus?.("Writing for each ancestor…");
    const started = now();
    let raw = await generateText(this.options, this.info.id, context, prompt, false);
    let parsed = parseMedium(raw, ids);
    if (!parsed.ok && now() - started < retryBudgetMs) {
      try {
        const second = await generateText(
          this.options,
          this.info.id,
          context,
          retryPrompt(prompt, parsed.problem),
          false,
        );
        const secondParsed = parseMedium(second, ids);
        if (secondParsed.ok || second.trim() !== "") {
          raw = second;
          parsed = secondParsed;
        }
      } catch (error: unknown) {
        if (isAbortError(error) || context.signal.aborted) throw error;
        // The retry failed: keep what the first try produced.
      }
    }
    if (raw.trim() === "") throw new Error("The medium wrote nothing.");
    return parsed.ok
      ? { kind: "spoken", text: raw, notes: parsed.notes }
      : { kind: "spoken", text: raw };
  }
}
