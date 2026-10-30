import type { GenerationSettings } from "./protocol.js";

/**
 * The sampling options of one GPT-2 generation. They exist so the ghost words are true
 * (AC-004.1, AC-004.3): the probabilities shown are softmax(logits / temperature) over the whole
 * vocabulary, so the sampler must draw from exactly that distribution.
 * - `top_k: 0`: transformers.js's `MultinomialSampler` keeps only the `generation_config.top_k`
 *   best tokens (default 50, `src/generation/configuration_utils.js`) and renormalises them
 *   (`src/generation/logits_sampler.js`: `if (top_k > 0) k = Math.min(top_k, k)`). 0 means the
 *   full vocabulary.
 * - `temperature: 1`: the library's own temperature warper then does nothing; `StepRecorder`
 *   applies the real temperature itself, after recording the step.
 */
export function samplingOptions(
  settings: GenerationSettings,
  blockedSequences: number[][],
): Record<string, unknown> {
  return {
    max_new_tokens: settings.maxTokens,
    do_sample: true,
    temperature: 1,
    top_k: 0,
    ...(blockedSequences.length === 0 ? {} : { bad_words_ids: blockedSequences }),
  };
}
