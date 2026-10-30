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
  /** True when every file of the model is already stored on this device. Never downloads. */
  isCached?(modelId: string, source: PinnedSource): Promise<boolean>;
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
  cancelled: boolean;
  settled: boolean;
  promise: Promise<LoadedModel>;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The message handling of the inference worker: `load`, `generate`, `cancel` of the typed
 * protocol (design.md, Interfaces), independent of `self` and of transformers.js so it is
 * testable with a fake runtime. One generation at a time: the ritual is sequential.
 */
export function createInferenceHost({ runtime, send }: InferenceHostOptions): InferenceHost {
  const loading = new Map<string, LoadEntry>();
  const running = new Map<string, AbortController>();

  /**
   * Starts (or joins) the load of a model. transformers.js 4.3.1 cannot abort a download, so
   * `cancel-load` stops listening instead: the entry is dropped (a later `load` starts afresh),
   * nothing more is sent for it, and the model is disposed if the load still finishes.
   */
  function load(
    modelId: string,
    source: ModelSource | undefined,
    backend: ModelDevice | undefined,
  ): LoadEntry {
    const existing = loading.get(modelId);
    if (existing !== undefined) return existing;
    const entry: LoadEntry = { cancelled: false, settled: false, promise: null as never };
    entry.promise = (async (): Promise<LoadedModel> => {
      if (!runtime.supports(modelId)) {
        throw new Error(`No runtime for ${modelId} yet.`);
      }
      const pinned = pinnedSource(source);
      const model = await runtime.load(
        modelId,
        pinned,
        (loaded, total) => {
          if (!entry.cancelled) send({ type: "progress", modelId, loaded, total });
        },
        backend,
      );
      if (entry.cancelled) await model.dispose();
      return model;
    })();
    loading.set(modelId, entry);
    const settle = (failed: boolean): void => {
      entry.settled = true;
      // A failed load is forgotten so that a later attempt can try again.
      if (failed && loading.get(modelId) === entry) loading.delete(modelId);
    };
    entry.promise.then(
      () => {
        settle(false);
      },
      () => {
        settle(true);
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
      // A load that was cancelled while it ran has no listener any more.
      if (entry.cancelled) return;
      send({ type: "ready", modelId, device: model.device, dtype: model.dtype });
    } catch (error: unknown) {
      if (!entry.cancelled) send({ type: "error", modelId, message: describe(error) });
    }
  }

  /** Anything that goes wrong counts as "not stored", so the visitor is asked before a download. */
  async function handleProbe(modelId: string, source: ModelSource | undefined): Promise<void> {
    // A model that would be refused is reported as such, so the visitor is never asked to
    // download something that will not load (AC-003.3).
    let pinned: PinnedSource;
    try {
      if (!runtime.supports(modelId)) throw new Error(`No runtime for ${modelId} yet.`);
      pinned = pinnedSource(source);
    } catch (error: unknown) {
      send({ type: "probed", modelId, cached: false, refused: describe(error) });
      return;
    }
    let cached = false;
    try {
      cached = (await runtime.isCached?.(modelId, pinned)) ?? false;
    } catch {
      cached = false;
    }
    send({ type: "probed", modelId, cached });
  }

  function cancelLoad(modelId: string): void {
    const entry = loading.get(modelId);
    if (entry === undefined || entry.settled) return;
    entry.cancelled = true;
    loading.delete(modelId);
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
    if (running.size > 0) {
      send({ type: "error", requestId, message: "The model is busy with another answer." });
      return;
    }
    const controller = new AbortController();
    running.set(requestId, controller);
    try {
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
          running.get(message.requestId)?.abort();
          break;
        case "cancel-load":
          cancelLoad(message.modelId);
          break;
        case "probe":
          void handleProbe(message.modelId, message.source);
          break;
      }
    },
  };
}
