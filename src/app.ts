import type { AltarData } from "./data/load.js";
import { buildRitualPlan, type RitualDependencies } from "./ritual/plan.js";
import { RitualRunner } from "./ritual/sequencer.js";
import { createRecordedSource } from "./data/recorded-source.js";
import { NO_WEBGPU_MESSAGE } from "./ritual/gpu.js";
import { renderAltar, showBrowserNote, showLoadError } from "./ui/altar.js";
import { wireOffering } from "./ui/offering.js";
import { createRitualView } from "./ui/ritual-view.js";
import { wireStoredModels, type CacheStorageLike } from "./ui/stored-models.js";
import { withDebugLogging } from "./debug/debug-log.js";
import inferenceWorkerUrl from "./worker/inference.worker.ts?worker&url";
import { knownScripts, workerScriptUrl, type KnownScripts } from "./worker/trusted-worker.js";
import { lazyPort, portForWorker } from "./worker/worker-port.js";

/** The only two script URLs the page may start (Trusted Types): the inference worker and sw.js. */
export function pageScripts(): KnownScripts {
  return knownScripts(inferenceWorkerUrl, import.meta.env.BASE_URL);
}

/**
 * What ships: the real inference worker (GPT-2 and Gemma 4), created on first use, and the
 * recorded voices (T-005). With `debug`, load times, tokens per second and errors go to the
 * console (NFR-007).
 */
export function createProductionDependencies(
  data: AltarData,
  webgpu: boolean,
  debug = false,
): RitualDependencies {
  const port = lazyPort(() =>
    portForWorker(
      // Trusted Types (CSP) require the script URL to pass through the worker policy.
      new Worker(workerScriptUrl(pageScripts()), {
        type: "module",
      }),
    ),
  );
  return {
    worker: debug ? withDebugLogging(port, console) : port,
    recorded: createRecordedSource(data.recordedVoices),
    includeMedium: true,
    ...(debug ? { log: (message: string) => console.info(message) } : {}),
    webgpu,
  };
}

/** Renders the altar and connects the offering form to the ritual sequencer. */
/** `onRitualCompleted` runs after a ritual that ended as completed (not stopped, not ended early). */
export function startAltar(
  doc: Document,
  data: AltarData,
  deps: RitualDependencies,
  onRitualCompleted?: () => void,
  cacheStorage: CacheStorageLike | undefined = typeof caches === "undefined" ? undefined : caches,
): void {
  renderAltar(doc, data);
  const storedModels = wireStoredModels(doc, cacheStorage);
  if (deps.webgpu === false) showBrowserNote(doc, NO_WEBGPU_MESSAGE);
  const runner = new RitualRunner(buildRitualPlan(data.ancestors, deps), createRitualView(doc));
  const form = wireOffering(doc, data.questions, {
    onOffer(question) {
      const ritual = runner.start(question);
      if (ritual === null) return;
      form.setRunning(true);
      storedModels.setBusy(true);
      ritual
        .then((end) => {
          if (end === "completed") onRitualCompleted?.();
        })
        .catch((error: unknown) => {
          showLoadError(doc, error);
        })
        .finally(() => {
          form.setRunning(false);
          storedModels.setBusy(false);
        });
    },
    onStop() {
      runner.stop();
    },
  });
}
