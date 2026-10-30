import type {
  Alternative,
  ModelWorkerPort,
  UiToWorkerMessage,
  WorkerToUiMessage,
} from "../worker/protocol.js";

/** Present only in builds that include the fake worker; the production build test looks for it. */
export const FAKE_WORKER_MARKER = "fake-model-worker-v1";

export interface FakeWorkerOptions {
  /** Delay between tokens, in ms. 0 still yields to the event loop between tokens. */
  readonly tokenDelayMs?: number;
  /** Model ids whose `load` fails. */
  readonly failLoad?: readonly string[];
  /** Model ids whose `generate` fails after `failAfterTokens` tokens. */
  readonly failGenerate?: readonly string[];
  readonly failAfterTokens?: number;
  /** Model ids that report top-3 alternatives with each token. */
  readonly alternativesFor?: readonly string[];
  /** Delay before a model is ready, in ms (lets tests press Stop during a load). */
  readonly loadDelayMs?: number;
  /** Overrides the deterministic words of a model; the prompt is what the UI sent. */
  readonly wordsFor?: (modelId: string, prompt: string) => readonly string[];
  /** Model ids that are stored on the device already: a `probe` of them answers cached. */
  readonly cachedModels?: readonly string[];
  /**
   * What the medium's prompt gets back: a valid JSON reply, a broken one, or a broken first reply
   * and a valid retry. Any other prompt gets the model's plain words.
   */
  readonly mediumReply?: "valid" | "broken" | "broken-then-valid";
}

const MEDIUM_MARKER = "<answers>";

/** The ancestor ids a medium prompt asks for (its `<answer id="…">` blocks). */
export function idsInMediumPrompt(prompt: string): string[] {
  return [...prompt.matchAll(/<answer id="([^"]+)"/g)].map((m) => m[1] ?? "");
}

function validMediumJson(prompt: string): string {
  const spanish = /Spanish/.test(prompt);
  const entries = idsInMediumPrompt(prompt).map((ancestorId) => ({
    ancestorId,
    meaning: spanish ? `Quiso decir algo sobre ${ancestorId}.` : `It tried to say something.`,
    calaverita: spanish
      ? [
          "Linea uno del altar,",
          "linea dos para cantar,",
          "linea tres sin dudar,",
          "linea cuatro a descansar.",
        ]
      : [
          "Line one for the altar,",
          "line two will not falter,",
          "line three sets us free,",
          "line four, rest in peace.",
        ],
  }));
  return JSON.stringify(entries);
}

function chunks(text: string): string[] {
  return text.match(/[\s\S]{1,14}/g) ?? [];
}

const DEFAULT_WORDS = ["Fake", " voice", " of", " the", " altar", " speaks", " tonight."];

function defaultWords(modelId: string): readonly string[] {
  return [`[${modelId}]`, ...DEFAULT_WORDS];
}

function alternativesAt(index: number): readonly Alternative[] {
  return [
    { text: ` maybe${String(index)}`, p: 0.2 },
    { text: ` perhaps${String(index)}`, p: 0.1 },
    { text: ` almost${String(index)}`, p: 0.05 },
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A deterministic stand-in for the inference worker: same protocol, no models, no network.
 * Used by unit tests and by the test-only build mode (`vite build --mode test`).
 */
export function createFakeWorker(options: FakeWorkerOptions = {}): ModelWorkerPort & {
  readonly marker: string;
} {
  const listeners = new Set<(message: WorkerToUiMessage) => void>();
  const loaded = new Set<string>();
  /** Requests being generated; a cancel only matters for these, so nothing leaks. */
  const active = new Set<string>();
  const cancelledRequests = new Set<string>();
  /** Loads in flight; `cancel-load` removes the entry and the load then stays silent. */
  const loading = new Set<string>();
  const delayMs = options.tokenDelayMs ?? 0;

  const emit = (message: WorkerToUiMessage): void => {
    for (const listener of [...listeners]) listener(message);
  };

  async function load(modelId: string): Promise<void> {
    if (loaded.has(modelId)) {
      // Loading a loaded model still answers `ready` (protocol contract).
      emit({ type: "ready", modelId });
      return;
    }
    loading.add(modelId);
    await sleep(options.loadDelayMs ?? 0);
    if (!loading.delete(modelId)) return;
    if (options.failLoad?.includes(modelId) === true) {
      emit({ type: "error", modelId, message: `Fake load failure for ${modelId}.` });
      return;
    }
    emit({ type: "progress", modelId, loaded: 1, total: 2 });
    emit({ type: "progress", modelId, loaded: 2, total: 2 });
    loaded.add(modelId);
    emit({ type: "ready", modelId });
  }

  async function generate(requestId: string, modelId: string, prompt: string): Promise<void> {
    if (!loaded.has(modelId)) {
      emit({ type: "error", requestId, message: `${modelId} is not loaded.` });
      return;
    }
    active.add(requestId);
    try {
      await speak(requestId, modelId, prompt);
    } finally {
      active.delete(requestId);
      cancelledRequests.delete(requestId);
    }
  }

  let mediumRequests = 0;

  function wordsOf(modelId: string, prompt: string): readonly string[] {
    if (prompt.includes(MEDIUM_MARKER) && options.mediumReply !== undefined) {
      mediumRequests += 1;
      const valid =
        options.mediumReply === "valid" ||
        (options.mediumReply === "broken-then-valid" && mediumRequests > 1);
      return chunks(
        valid ? validMediumJson(prompt) : "Here is some verse, but not as JSON: {broken",
      );
    }
    return (options.wordsFor ?? defaultWords)(modelId, prompt);
  }

  async function speak(requestId: string, modelId: string, prompt: string): Promise<void> {
    const words = wordsOf(modelId, prompt);
    const failing = options.failGenerate?.includes(modelId) === true;
    const failAfter = options.failAfterTokens ?? 2;
    for (const [index, text] of words.entries()) {
      await sleep(delayMs);
      if (cancelledRequests.has(requestId)) return;
      if (failing && index >= failAfter) {
        emit({ type: "error", requestId, message: `Fake generation failure for ${modelId}.` });
        return;
      }
      emit(
        options.alternativesFor?.includes(modelId) === true
          ? { type: "token", requestId, text, alternatives: alternativesAt(index) }
          : { type: "token", requestId, text },
      );
    }
    emit({ type: "done", requestId });
  }

  return {
    marker: FAKE_WORKER_MARKER,
    post(message: UiToWorkerMessage): void {
      switch (message.type) {
        case "load":
          void load(message.modelId);
          break;
        case "generate":
          void generate(message.requestId, message.modelId, message.prompt);
          break;
        case "probe":
          emit({
            type: "probed",
            modelId: message.modelId,
            cached: options.cachedModels?.includes(message.modelId) === true,
          });
          break;
        case "cancel":
          if (active.has(message.requestId)) cancelledRequests.add(message.requestId);
          break;
        case "cancel-load":
          loading.delete(message.modelId);
          break;
      }
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
