/**
 * Typed messages between the altar UI and the inference worker (design.md, Interfaces).
 * `requestId` correlates the messages of one `generate` call; the real worker (T-004, T-006)
 * and the fake worker both speak exactly this protocol.
 */

export interface GenerationSettings {
  readonly maxTokens: number;
  readonly temperature: number;
}

/** One token the model almost chose at a step (GPT-2 only; REQ-004). */
export interface Alternative {
  readonly text: string;
  readonly p: number;
}

/**
 * Where a model comes from, copied from ancestors.json. The worker loads a model only from
 * this repository at this exact revision, and refuses when either is missing (AC-003.3).
 */
export interface ModelSource {
  readonly repositoryId: string | null;
  readonly revision: string | null;
  /** ONNX weight precision per runtime (for example "fp16" or "q8"); null uses the worker's default. */
  readonly dtypes: { readonly webgpu?: string; readonly wasm?: string } | null;
}

export type ModelDevice = "webgpu" | "wasm";

/**
 * `load` of a model that is already loaded still answers with `ready` (progress messages are
 * optional in that case), so callers can always wait for `ready` after sending `load`.
 */
export type UiToWorkerMessage =
  | {
      readonly type: "load";
      readonly modelId: string;
      readonly source?: ModelSource;
      /** Browsers without WebGPU ask for "wasm" (AC-010.1); without it WebGPU is tried first. */
      readonly backend?: "webgpu" | "wasm";
    }
  | {
      readonly type: "generate";
      readonly requestId: string;
      readonly modelId: string;
      readonly prompt: string;
      readonly settings: GenerationSettings | null;
    }
  /** Stops an in-flight `generate`. No reply is expected. */
  | { readonly type: "cancel"; readonly requestId: string }
  /**
   * Stops an in-flight `load` (the visitor pressed Stop while a model was downloading or
   * initialising). No reply is expected; after it the model may be unloaded, and a later `load`
   * starts again. Ignored when the model is already loaded or not loading.
   */
  | { readonly type: "cancel-load"; readonly modelId: string };

export type WorkerToUiMessage =
  | {
      readonly type: "progress";
      readonly modelId: string;
      readonly loaded: number;
      readonly total: number;
    }
  | {
      readonly type: "ready";
      readonly modelId: string;
      /** What the model runs on; reported for `?debug` and the manual checks. */
      readonly device?: ModelDevice;
      readonly dtype?: string;
    }
  | {
      readonly type: "token";
      readonly requestId: string;
      readonly text: string;
      readonly alternatives?: readonly Alternative[];
    }
  | { readonly type: "done"; readonly requestId: string }
  | {
      readonly type: "error";
      /** Set when a `generate` call failed. */
      readonly requestId?: string;
      /** Set when a `load` call failed. */
      readonly modelId?: string;
      readonly message: string;
    };

/** The UI's end of the worker channel. A real Worker is wrapped in this; tests use a fake. */
export interface ModelWorkerPort {
  post(message: UiToWorkerMessage): void;
  /** Subscribes to worker messages; returns the unsubscribe function. */
  subscribe(listener: (message: WorkerToUiMessage) => void): () => void;
}
