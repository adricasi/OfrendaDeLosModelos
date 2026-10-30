import type { AltarData } from "./data/load.js";
import { buildRitualPlan, type RitualDependencies } from "./ritual/plan.js";
import { RitualRunner } from "./ritual/sequencer.js";
import { createRecordedSource } from "./data/recorded-source.js";
import { NO_WEBGPU_MESSAGE } from "./ritual/gpu.js";
import { renderAltar, showBrowserNote, showLoadError } from "./ui/altar.js";
import { wireOffering } from "./ui/offering.js";
import { createRitualView } from "./ui/ritual-view.js";
import { withDebugLogging } from "./debug/debug-log.js";
import inferenceWorkerUrl from "./worker/inference.worker.ts?worker&url";
import { workerScriptUrl } from "./worker/trusted-worker.js";
import { lazyPort, portForWorker } from "./worker/worker-port.js";

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
      new Worker(workerScriptUrl(new URL(inferenceWorkerUrl, location.href)), {
        type: "module",
      }),
    ),
  );
  return {
    worker: debug ? withDebugLogging(port, console) : port,
    recorded: createRecordedSource(data.recordedVoices),
    includeMedium: true,
    webgpu,
  };
}

/** Renders the altar and connects the offering form to the ritual sequencer. */
export function startAltar(doc: Document, data: AltarData, deps: RitualDependencies): void {
  renderAltar(doc, data);
  if (deps.webgpu === false) showBrowserNote(doc, NO_WEBGPU_MESSAGE);
  const runner = new RitualRunner(buildRitualPlan(data.ancestors, deps), createRitualView(doc));
  const form = wireOffering(doc, data.questions, {
    onOffer(question) {
      const ritual = runner.start(question);
      if (ritual === null) return;
      form.setRunning(true);
      ritual
        .catch((error: unknown) => {
          showLoadError(doc, error);
        })
        .finally(() => {
          form.setRunning(false);
        });
    },
    onStop() {
      runner.stop();
    },
  });
}
