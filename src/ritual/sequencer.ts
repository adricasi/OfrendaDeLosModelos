import { isAbortError } from "./steps.js";
import type { CompletedStep, Question, RitualEnd, RitualStep, RitualView } from "./types.js";

/**
 * Runs the steps in their fixed order (design D-4). A failing step is isolated: the view is
 * told it could not come and the ritual continues (AC-003.3), unless the step ends the ritual
 * (AC-006.4). Aborting the signal stops the ritual after cancelling the current step.
 */
export async function runRitual(
  steps: readonly RitualStep[],
  question: Question,
  view: RitualView,
  signal: AbortSignal,
): Promise<RitualEnd> {
  view.ritualStarted(question);
  let end: RitualEnd = "completed";
  const previous: CompletedStep[] = [];
  for (const step of steps) {
    if (signal.aborted) {
      end = "stopped";
      break;
    }
    view.stepStarted(step.info);
    try {
      const outcome = await step.run({
        question,
        previous,
        signal,
        emitToken: (token) => {
          if (!signal.aborted) view.token(step.info.id, token);
        },
        reportProgress: (loaded, total) => {
          if (!signal.aborted) view.stepProgress(step.info.id, loaded, total);
        },
      });
      // An answer that completed just before Stop is kept; the ritual still ends as stopped.
      view.stepFinished(step.info, outcome);
      previous.push({ info: step.info, outcome });
      if (signal.aborted) {
        end = "stopped";
        break;
      }
    } catch (error: unknown) {
      if (signal.aborted || isAbortError(error)) {
        end = "stopped";
        break;
      }
      const failed = { kind: "unavailable" } as const;
      view.stepFinished(step.info, failed);
      previous.push({ info: step.info, outcome: failed });
      if (step.endsRitualOnFailure) {
        end = "ended-early";
        break;
      }
    }
  }
  view.ritualFinished(end);
  return end;
}

/** One ritual at a time (AC-002.4): a second offering is refused while one runs. */
export class RitualRunner {
  private controller: AbortController | null = null;

  constructor(
    private readonly steps: readonly RitualStep[],
    private readonly view: RitualView,
  ) {}

  get running(): boolean {
    return this.controller !== null;
  }

  /** Returns null (and does nothing) when a ritual is already running. */
  start(question: Question): Promise<RitualEnd> | null {
    if (this.controller !== null) return null;
    const controller = new AbortController();
    this.controller = controller;
    return runRitual(this.steps, question, this.view, controller.signal).finally(() => {
      this.controller = null;
    });
  }

  stop(): void {
    this.controller?.abort();
  }
}
