import type { Alternative } from "./protocol.js";

/** A token id and its probability at one generation step. */
export interface Candidate {
  readonly id: number;
  readonly p: number;
}

/** How many alternatives the UI shows (AC-004.1). */
export const ALTERNATIVE_COUNT = 3;

/**
 * Candidates kept per step. More than `ALTERNATIVE_COUNT + 1` so that dropping the chosen
 * token and tokens that cannot be shown as text (partial UTF-8) still leaves three.
 */
const CANDIDATES_KEPT = 8;

/**
 * The most likely tokens of one step with their probabilities: softmax of `logits / temperature`
 * over the whole vocabulary (AC-004.1, AC-004.3). Tokens with probability 0 (for example the
 * blocked ones, whose logit is -Infinity) are never returned. Sorted by probability, highest first.
 */
export function topCandidates(
  logits: ArrayLike<number>,
  temperature: number,
  count: number = CANDIDATES_KEPT,
): Candidate[] {
  if (!(temperature > 0)) throw new RangeError("temperature must be greater than 0");
  let max = -Infinity;
  for (let i = 0; i < logits.length; i += 1) {
    const value = logits[i] ?? -Infinity;
    if (value > max) max = value;
  }
  if (max === -Infinity) return [];

  let sum = 0;
  // `best` stays sorted by descending logit and never grows past `count`.
  const best: { id: number; scaled: number }[] = [];
  for (let i = 0; i < logits.length; i += 1) {
    const value = logits[i] ?? -Infinity;
    if (!Number.isFinite(value)) continue;
    const scaled = (value - max) / temperature;
    sum += Math.exp(scaled);
    if (best.length === count && scaled <= (best[count - 1]?.scaled ?? -Infinity)) continue;
    let position = best.length;
    while (position > 0 && (best[position - 1]?.scaled ?? Infinity) < scaled) position -= 1;
    best.splice(position, 0, { id: i, scaled });
    if (best.length > count) best.pop();
  }
  return best.map(({ id, scaled }) => ({ id, p: Math.exp(scaled) / sum }));
}

/**
 * The ghost words of a step: the top candidates without the token that was chosen, shown as
 * text, at most three. `decode` turns one token id into its text; ids whose text is not
 * displayable on its own (a partial UTF-8 sequence) are skipped. Nothing is invented: every
 * alternative is one of the model's own most likely tokens at that step (AC-004.3).
 */
export function ghostAlternatives(
  candidates: readonly Candidate[],
  chosenId: number,
  decode: (id: number) => string,
  limit: number = ALTERNATIVE_COUNT,
): Alternative[] {
  const alternatives: Alternative[] = [];
  for (const candidate of candidates) {
    if (alternatives.length === limit) break;
    if (candidate.id === chosenId) continue;
    const text = decode(candidate.id);
    if (text === "" || text.includes("�")) continue;
    alternatives.push({ text, p: candidate.p });
  }
  return alternatives;
}

/**
 * Sits in the logits pipeline of one generation (as a transformers.js logits processor).
 * For each step it records the step's candidates from the logits the model produced, then
 * divides the logits by the temperature in place, so the sampler draws from exactly the
 * distribution whose probabilities were recorded. The generation itself must therefore run
 * at temperature 1 in the library, or the temperature would be applied twice.
 */
export class StepRecorder {
  private latest: Candidate[] = [];

  constructor(private readonly temperature: number) {
    if (!(temperature > 0)) throw new RangeError("temperature must be greater than 0");
  }

  /** Records the candidates of this step and applies the temperature to `logits`. */
  apply(logits: Float32Array): void {
    this.latest = topCandidates(logits, this.temperature);
    if (this.temperature === 1) return;
    for (let i = 0; i < logits.length; i += 1) {
      logits[i] = (logits[i] ?? 0) / this.temperature;
    }
  }

  /** The candidates of the step that was recorded last; empty when none was. */
  take(): Candidate[] {
    const candidates = this.latest;
    this.latest = [];
    return candidates;
  }
}
