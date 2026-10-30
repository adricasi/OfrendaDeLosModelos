import type { AltarData } from "./data/load.js";
import { buildRitualPlan, type RitualDependencies } from "./ritual/plan.js";
import { RitualRunner } from "./ritual/sequencer.js";
import { noRecordedVoices } from "./ritual/steps.js";
import { renderAltar } from "./ui/altar.js";
import { wireOffering } from "./ui/offering.js";
import { createRitualView } from "./ui/ritual-view.js";
import { withDebugLogging } from "./debug/debug-log.js";
import { lazyPort, portForWorker } from "./worker/worker-port.js";

/**
 * What ships: the real inference worker (GPT-2 now, Gemma 4 with T-006), created on first use.
 * Recordings (T-005) and the medium (T-006) are not plugged in yet. With `debug`, load times,
 * tokens per second and errors go to the console (NFR-007).
 */
export function createProductionDependencies(debug: boolean): RitualDependencies {
  const port = lazyPort(() =>
    portForWorker(
      new Worker(new URL("./worker/inference.worker.ts", import.meta.url), { type: "module" }),
    ),
  );
  return {
    worker: debug ? withDebugLogging(port, console) : port,
    recorded: noRecordedVoices,
    includeMedium: false,
  };
}

/** Renders the altar and connects the offering form to the ritual sequencer. */
export function startAltar(doc: Document, data: AltarData, deps: RitualDependencies): void {
  renderAltar(doc, data);
  const runner = new RitualRunner(buildRitualPlan(data.ancestors, deps), createRitualView(doc));
  const form = wireOffering(doc, data.questions, {
    onOffer(question) {
      const ritual = runner.start(question);
      if (ritual === null) return;
      form.setRunning(true);
      void ritual.finally(() => {
        form.setRunning(false);
      });
    },
    onStop() {
      runner.stop();
    },
  });
}
