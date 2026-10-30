import type {
  Alternative,
  GenerationSettings,
  ModelDevice,
  ModelSource,
  UiToWorkerMessage,
  WorkerToUiMessage,
} from "./protocol.js";

/** A model's pinned revision is a full git commit hash, never a branch name that can move. */
const PINNED_REVISION = /^[0-9a-f]{40}$/;
const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Used when the UI sends no settings: GPT-2 stops at 60 tokens (AC-003.2). */
export const DEFAULT_SETTINGS: GenerationSettings = { maxTokens: 60, temperature: 0.7 };

export interface TokenEvent {
  readonly text: string;
  readonly alternatives?: readonly Alternative[];
}

export interface GenerateParams {
  readonly prompt: string;
  readonly settings: GenerationSettings;
  readonly signal: AbortSignal;
  readonly onToken: (event: TokenEvent) => void;
}

/** A model that is loaded and ready to generate. */
export interface LoadedModel {
  readonly device: ModelDevice;
  readonly dtype: string;
  /** Resolves when generation ended (end-of-text, token limit or abort); rejects when it failed. */
  generate(params: GenerateParams): Promise<void>;
  /** Releases the model's memory. */
  dispose(): Promise<void>;
}

export interface PinnedSource {
  readonly repositoryId: string;
  readonly revision: string;
  readonly dtypes: ModelSource["dtypes"];
}

/** The part of the worker that talks to transformers.js; replaced by a fake in tests. */
export interface ModelRuntime {
  /** Ids of the models this runtime can run. */
  supports(modelId: string): boolean;
  load(
    modelId: string,
    source: PinnedSource,
    onProgress: (loaded: number, total: number) => void,
    backend?: ModelDevice,
  ): Promise<LoadedModel>;
}

/**
 * Checks that a model has a pinned source (AC-003.3). Loading from an unpinned or malformed
 * source is refused, so a model can only come from the repository and commit in ancestors.json.
 */
export function pinnedSource(source: ModelSource | undefined): PinnedSource {
  if (source === undefined || source.repositoryId === null || source.revision === null) {
    throw new Error("This model has no pinned repository and revision, so it will not be loaded.");
  }
  if (!REPOSITORY_ID.test(source.repositoryId)) {
    throw new Error(`"${source.repositoryId}" is not a valid model repository id.`);
  }
  if (!PINNED_REVISION.test(source.revision)) {
    throw new Error("The model revision must be a full 40-character commit hash.");
  }
  return {
    repositoryId: source.repositoryId,
    revision: source.revision,
    dtypes: source.dtypes,
  };
}

export interface InferenceHostOptions {
  readonly runtime: ModelRuntime;
  readonly send: (message: WorkerToUiMessage) => void;
}

export interface InferenceHost {
  handle(message: UiToWorkerMessage): void;
}

interface LoadEntry {
  /** The UI stopped waiting for this load; a new `load` reuses the entry and clears this. */
  cancelled: boolean;
  settled: boolean;
  /** Dispose and forget the model as soon as the load settles (an `unload` arrived meanwhile). */
  unloadWhenSettled: boolean;
  promise: Promise<LoadedModel>;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The message handling of the inference worker: `load`, `cancel-load`, `unload`, `generate`
 * and `cancel` of the typed protocol (design.md, Interfaces), independent of `self` and of
 * transformers.js so it is testable with a fake runtime. Generations run one at a time, in
 * the order they arrive: a `generate` sent right after a `cancel` waits for the cancelled
 * one to stop instead of being refused.
 */
export function createInferenceHost({ runtime, send }: InferenceHostOptions): InferenceHost {
  const loading = new Map<string, LoadEntry>();
  const running = new Map<string, { modelId: string; controller: AbortController }>();
  let queueTail: Promise<void> = Promise.resolve();

  /**
   * Starts (or joins) the load of a model. transformers.js 4.3.1 cannot abort a download, so
   * `cancel-load` only stops listening: the entry stays until it settles, nothing more is sent
   * for it meanwhile, and a later `load` reuses it (no second download). A model whose load
   * finishes after a cancel stays loaded, ready for the next `load`; `unload` frees it.
   */
  function load(
    modelId: string,
    source: ModelSource | undefined,
    backend: ModelDevice | undefined,
  ): LoadEntry {
    const existing = loading.get(modelId);
    if (existing !== undefined) {
      existing.cancelled = false;
      existing.unloadWhenSettled = false;
      return existing;
    }
    const entry: LoadEntry = {
      cancelled: false,
      settled: false,
      unloadWhenSettled: false,
      promise: null as never,
    };
    entry.promise = (async (): Promise<LoadedModel> => {
      if (!runtime.supports(modelId)) {
        throw new Error(`No runtime for ${modelId} yet.`);
      }
      const pinned = pinnedSource(source);
      return runtime.load(
        modelId,
        pinned,
        (loaded, total) => {
          if (!entry.cancelled && !entry.unloadWhenSettled) {
            send({ type: "progress", modelId, loaded, total });
          }
        },
        backend,
      );
    })();
    loading.set(modelId, entry);
    entry.promise.then(
      async (model) => {
        entry.settled = true;
        if (entry.unloadWhenSettled) {
          if (loading.get(modelId) === entry) loading.delete(modelId);
          await model.dispose();
        }
      },
      () => {
        entry.settled = true;
        // A failed load is forgotten so that a later attempt can try again.
        if (loading.get(modelId) === entry) loading.delete(modelId);
      },
    );
    return entry;
  }

  async function handleLoad(
    modelId: string,
    source: ModelSource | undefined,
    backend: ModelDevice | undefined,
  ): Promise<void> {
    const entry = load(modelId, source, backend);
    try {
      const model = await entry.promise;
      // A load whose listener left (and did not come back) has nobody to tell.
      if (entry.cancelled || entry.unloadWhenSettled) return;
      send({ type: "ready", modelId, device: model.device, dtype: model.dtype });
    } catch (error: unknown) {
      if (!entry.cancelled) send({ type: "error", modelId, message: describe(error) });
    }
  }

  function cancelLoad(modelId: string): void {
    const entry = loading.get(modelId);
    if (entry === undefined || entry.settled) return;
    entry.cancelled = true;
  }

  /** Frees a model's memory: stops its answers, then disposes it (after its load, if running). */
  function unload(modelId: string): void {
    for (const { modelId: runningModel, controller } of running.values()) {
      if (runningModel === modelId) controller.abort();
    }
    const entry = loading.get(modelId);
    if (entry === undefined) return;
    if (!entry.settled) {
      entry.unloadWhenSettled = true;
      return;
    }
    loading.delete(modelId);
    // Wait for the answers that were aborted above before releasing the weights.
    const afterAnswers = queueTail;
    void entry.promise.then(
      async (model) => {
        await afterAnswers;
        await model.dispose();
      },
      () => undefined,
    );
  }

  async function handleGenerate(
    requestId: string,
    modelId: string,
    prompt: string,
    settings: GenerationSettings | null,
  ): Promise<void> {
    const pending = loading.get(modelId)?.promise;
    if (pending === undefined) {
      send({ type: "error", requestId, message: `${modelId} is not loaded.` });
      return;
    }
    const controller = new AbortController();
    running.set(requestId, { modelId, controller });
    const previous = queueTail;
    let release: () => void = () => undefined;
    queueTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      // The one before us (possibly just cancelled) must have stopped first.
      await previous;
      if (controller.signal.aborted) return;
      const model = await pending;
      await model.generate({
        prompt,
        settings: settings ?? DEFAULT_SETTINGS,
        signal: controller.signal,
        onToken: (event) => {
          if (controller.signal.aborted) return;
          send(
            event.alternatives === undefined
              ? { type: "token", requestId, text: event.text }
              : { type: "token", requestId, text: event.text, alternatives: event.alternatives },
          );
        },
      });
      // A cancelled answer ends silently: the UI has already moved on.
      if (!controller.signal.aborted) send({ type: "done", requestId });
    } catch (error: unknown) {
      if (!controller.signal.aborted) send({ type: "error", requestId, message: describe(error) });
    } finally {
      running.delete(requestId);
      release();
    }
  }

  return {
    handle(message: UiToWorkerMessage): void {
      switch (message.type) {
        case "load":
          void handleLoad(message.modelId, message.source, message.backend);
          break;
        case "generate":
          void handleGenerate(message.requestId, message.modelId, message.prompt, message.settings);
          break;
        case "cancel":
          running.get(message.requestId)?.controller.abort();
          break;
        case "cancel-load":
          cancelLoad(message.modelId);
          break;
        case "unload":
          unload(message.modelId);
          break;
      }
    },
  };
}
