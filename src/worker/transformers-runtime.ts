import {
  AutoModelForCausalLM,
  AutoTokenizer,
  BaseStreamer,
  InterruptableStoppingCriteria,
  env,
  type PretrainedModelOptions,
} from "@huggingface/transformers";

import { BLOCKED_WORDS } from "../data/blocked-words.js";
import { blockedTokenSequences } from "./blocked-tokens.js";
import { StepRecorder, ghostAlternatives } from "./ghost-words.js";
import type { GenerateParams, LoadedModel, ModelRuntime } from "./inference-host.js";
import type { ModelDevice } from "./protocol.js";
import { RecordingProcessor } from "./recording-processor.js";
import { samplingOptions } from "./sampling.js";
import { TokenTextAssembler } from "./token-text.js";

/** The ids this runtime serves; Gemma 4 arrives with T-006. */
const SUPPORTED_MODEL_IDS: ReadonlySet<string> = new Set(["gpt-2"]);

/** Used when ancestors.json names no dtype for a runtime. Both keep GPT-2 well under 300 MB. */
const DEFAULT_DTYPE: Readonly<Record<ModelDevice, string>> = { webgpu: "fp16", wasm: "q8" };

/** The ONNX Runtime WebAssembly build transformers.js 4.3.1 uses by default (src/backends/onnx.js). */
const WASM_FILE_STEM = "ort-wasm-simd-threaded.asyncify";

type Dtype = Extract<PretrainedModelOptions["dtype"], string>;

let configured = false;

/**
 * Makes transformers.js use only what the site ships or what ancestors.json pins:
 * - ONNX Runtime's WebAssembly files come from this site's own `ort/` folder (copied from
 *   node_modules at build time), not from jsDelivr;
 * - models come from the Hugging Face Hub only, never from local `/models/` paths;
 * - the WebAssembly factory is not turned into a blob URL (`useWasmCache`), which the CSP
 *   (`script-src 'self'`) would block;
 * - one thread: GitHub Pages cannot send the headers that cross-origin isolation needs.
 */
function configureEnvironment(): void {
  if (configured) return;
  configured = true;
  const base = new URL(import.meta.env.BASE_URL, self.location.origin);
  env.remoteHost = "https://huggingface.co/";
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useWasmCache = false;
  const wasm = env.backends.onnx.wasm;
  if (wasm === undefined) throw new Error("ONNX Runtime has no WebAssembly backend.");
  wasm.wasmPaths = {
    mjs: new URL(`ort/${WASM_FILE_STEM}.mjs`, base).href,
    wasm: new URL(`ort/${WASM_FILE_STEM}.wasm`, base).href,
  };
  wasm.numThreads = 1;
  wasm.proxy = false;
}

interface WebGpuNavigator {
  readonly gpu?: { requestAdapter(): Promise<unknown> };
}

/** AC-010.1: without a WebGPU adapter GPT-2 runs on WebAssembly. */
async function webGpuAvailable(): Promise<boolean> {
  try {
    const adapter = await (navigator as WebGpuNavigator).gpu?.requestAdapter();
    return adapter !== undefined && adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Aggregate download progress over all files of the model. transformers.js looks the file sizes
 * up first, so `total` is the whole download from the first event (modeling_utils.js,
 * `from_pretrained`, and the `progress_total` event in utils/core.js).
 */
function totalProgress(report: (loaded: number, total: number) => void) {
  return (info: unknown): void => {
    if (typeof info !== "object" || info === null) return;
    const event = info as { status?: unknown; loaded?: unknown; total?: unknown };
    if (event.status !== "progress_total") return;
    if (typeof event.loaded === "number" && typeof event.total === "number") {
      report(event.loaded, event.total);
    }
  };
}

/** Receives each generated token from `generate()` (put() is called with the prompt first). */
class TokenStreamer extends BaseStreamer {
  private promptSeen = false;

  constructor(private readonly onToken: (id: number) => void) {
    super();
  }

  override put(value: bigint[][]): void {
    if (!this.promptSeen) {
      this.promptSeen = true;
      return;
    }
    const id = value[0]?.[0];
    if (id !== undefined) this.onToken(Number(id));
  }

  override end(): void {
    // Nothing to flush: every token was already passed on.
  }
}

interface Loaded {
  readonly device: ModelDevice;
  readonly dtype: string;
  readonly model: CausalModel;
}

export function createTransformersRuntime(): ModelRuntime {
  return {
    supports: (modelId) => SUPPORTED_MODEL_IDS.has(modelId),

    async load(_modelId, source, onProgress, backend): Promise<LoadedModel> {
      configureEnvironment();
      const tokenizer = await AutoTokenizer.from_pretrained(source.repositoryId, {
        revision: source.revision,
      });
      const blocked = blockedTokenSequences(BLOCKED_WORDS, (text) =>
        tokenizer.encode(text, { add_special_tokens: false }),
      );

      const loadOn = async (device: ModelDevice): Promise<Loaded> => {
        const dtype = source.dtypes?.[device] ?? DEFAULT_DTYPE[device];
        const model = await AutoModelForCausalLM.from_pretrained(source.repositoryId, {
          revision: source.revision,
          device,
          dtype: dtype as Dtype,
          progress_callback: totalProgress(onProgress),
        });
        return { device, dtype, model };
      };

      // AC-010.1: WebAssembly when asked, or when there is no WebGPU adapter; otherwise WebGPU
      // first, with WebAssembly as the fallback if WebGPU cannot initialise.
      const attempts: ModelDevice[] =
        backend !== "wasm" && (await webGpuAvailable()) ? ["webgpu", "wasm"] : ["wasm"];
      let current: Loaded | null = null;
      let lastError: unknown = new Error("No runtime could load the model.");
      for (const device of attempts) {
        try {
          current = await loadOn(device);
          break;
        } catch (error: unknown) {
          // Typically WebGPU without shader-f16, or a device that cannot hold the weights.
          console.warn(`[ofrenda] ${device} could not load the model`, error);
          lastError = error;
        }
      }
      if (current === null) throw lastError;
      let loaded: Loaded = current;

      return {
        get device(): ModelDevice {
          return loaded.device;
        },
        get dtype(): string {
          return loaded.dtype;
        },
        async generate(params: GenerateParams): Promise<void> {
          let emitted = 0;
          const counting: GenerateParams = {
            ...params,
            onToken: (event) => {
              emitted += 1;
              params.onToken(event);
            },
          };
          try {
            await generateWith(loaded.model, tokenizer, blocked, counting);
          } catch (error: unknown) {
            // A WebGPU model can load fine and still fail on its first run (a shader or
            // device error). Before any token was shown, move to WebAssembly and try once more.
            if (loaded.device !== "webgpu" || emitted > 0 || params.signal.aborted) throw error;
            console.warn("[ofrenda] webgpu failed on its first run, using wasm", error);
            const failed = loaded;
            loaded = await loadOn("wasm");
            await failed.model.dispose();
            await generateWith(loaded.model, tokenizer, blocked, counting);
          }
        },
        async dispose(): Promise<void> {
          await loaded.model.dispose();
        },
      };
    },
  };
}

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
type CausalModel = Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>>;

async function generateWith(
  model: CausalModel,
  tokenizer: Tokenizer,
  blocked: number[][],
  { prompt, settings, signal, onToken }: GenerateParams,
): Promise<void> {
  const recorder = new StepRecorder(settings.temperature);
  const assembler = new TokenTextAssembler((ids) =>
    tokenizer.decode([...ids], {
      skip_special_tokens: true,
      clean_up_tokenization_spaces: false,
    }),
  );
  const decodeOne = (id: number): string =>
    tokenizer.decode([id], { skip_special_tokens: false, clean_up_tokenization_spaces: false });
  const eosTokenId: unknown = tokenizer.eos_token_id;

  const streamer = new TokenStreamer((id) => {
    const candidates = recorder.take();
    if (id === eosTokenId) return; // end of text: nothing to show (AC-003.2)
    const text = assembler.push(id);
    if (text === "") return; // an incomplete character; it completes with the next token
    const alternatives = ghostAlternatives(candidates, id, decodeOne);
    onToken(alternatives.length === 0 ? { text } : { text, alternatives });
  });

  const stop = new InterruptableStoppingCriteria();
  const onAbort = (): void => {
    stop.interrupt();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) return;
  try {
    const inputs = tokenizer(prompt);
    // The shipped typings declare `streamer` and `logits_processor` as the library's own
    // TextStreamer and LogitsProcessorList; generate() accepts any BaseStreamer and a plain
    // array of processors (src/models/modeling_utils.js, generate()), hence the cast.
    const options: Record<string, unknown> = {
      ...inputs,
      ...samplingOptions(settings, blocked),
      streamer,
      logits_processor: [new RecordingProcessor(recorder)],
      stopping_criteria: [stop],
    };
    await model.generate(options);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
