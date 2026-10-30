import { GenerationConfig } from "@huggingface/transformers";
import { describe, expect, it } from "vitest";

import { samplingOptions } from "../src/worker/sampling.js";

describe("sampling options (AC-004.1)", () => {
  const options = samplingOptions({ maxTokens: 60, temperature: 0.7 }, [[1, 2]]);

  it("samples the full vocabulary, so shown probabilities are the sampled ones", () => {
    expect(options["top_k"]).toBe(0);
  });

  it("leaves the temperature to the step recorder", () => {
    expect(options["temperature"]).toBe(1);
    expect(options["do_sample"]).toBe(true);
  });

  it("limits the answer to the configured tokens and blocks the listed sequences", () => {
    expect(options["max_new_tokens"]).toBe(60);
    expect(options["bad_words_ids"]).toEqual([[1, 2]]);
  });

  it("only uses names the library's generation config knows (anything else is ignored silently)", () => {
    const known = Object.getOwnPropertyNames(new GenerationConfig({}));
    for (const name of Object.keys(options)) expect(known).toContain(name);
  });
});
