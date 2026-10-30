import type { Alternative } from "../worker/protocol.js";

/** The question left on the altar. `offeredId` is null for the visitor's own question. */
export interface Question {
  readonly text: string;
  readonly offeredId: string | null;
  readonly lang: "en" | "es" | null;
}

export interface Token {
  readonly text: string;
  readonly alternatives?: readonly Alternative[];
}

export type StepMode = "live" | "recorded" | "medium";

export interface StepInfo {
  readonly id: string;
  readonly name: string;
  /** Language of `name` when it is not the page's English. */
  readonly nameLang?: "es";
  /** The altar place this step lights, if it has one. */
  readonly ancestorId: string | null;
  readonly mode: StepMode;
  /** A short caution shown with the answer, such as "Unfiltered 2019 model" (AC-003.4). */
  readonly caveat?: string;
}

export interface RecordedAnswer {
  /** Shown exactly as recorded (AC-005.4). */
  readonly text: string;
  /** Model, version, licence and date line (AC-005.2); filled in by the recording tool. */
  readonly credit: string;
}

/** What a step can report. */
export type SpokenOutcome =
  | { readonly kind: "spoken"; readonly text: string }
  | { readonly kind: "recorded"; readonly text: string; readonly credit: string }
  /** AC-005.3: recorded ancestors only answer the questions they left for us. */
  | { readonly kind: "not-invited" };

/** What the UI is told: a step outcome, or that the step failed (set by the sequencer only). */
export type StepOutcome = SpokenOutcome | { readonly kind: "unavailable" };

export interface StepContext {
  readonly question: Question;
  readonly signal: AbortSignal;
  emitToken(token: Token): void;
  reportProgress(loaded: number, total: number): void;
}

export interface RitualStep {
  readonly info: StepInfo;
  /** AC-006.4: when this step fails, the ritual ends without the steps after it. */
  readonly endsRitualOnFailure: boolean;
  /** Rejects when the step cannot speak; must reject promptly when `signal` aborts. */
  run(context: StepContext): Promise<SpokenOutcome>;
}

/** What the sequencer tells the UI. */
export interface RitualView {
  ritualStarted(question: Question): void;
  stepStarted(info: StepInfo): void;
  stepProgress(stepId: string, loaded: number, total: number): void;
  token(stepId: string, token: Token): void;
  stepFinished(info: StepInfo, outcome: StepOutcome): void;
  ritualFinished(reason: RitualEnd): void;
}

export type RitualEnd = "completed" | "stopped" | "ended-early";
