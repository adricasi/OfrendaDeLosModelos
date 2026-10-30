import type { AltarData } from "./data/load.js";
import { buildRitualPlan, type RitualDependencies } from "./ritual/plan.js";
import { RitualRunner } from "./ritual/sequencer.js";
import { createRecordedSource } from "./data/recorded-source.js";
import { NO_WEBGPU_MESSAGE } from "./ritual/gpu.js";
import { renderAltar, showBrowserNote, showLoadError } from "./ui/altar.js";
import { wireOffering } from "./ui/offering.js";
import { createRitualView } from "./ui/ritual-view.js";
import { createUnavailableWorker } from "./worker/unavailable.js";

/** What ships until the real workers (T-004, T-006) and recordings (T-005) are plugged in. */
export function createProductionDependencies(data: AltarData, webgpu: boolean): RitualDependencies {
  return {
    worker: createUnavailableWorker(),
    recorded: createRecordedSource(data.recordedVoices),
    includeMedium: false,
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
