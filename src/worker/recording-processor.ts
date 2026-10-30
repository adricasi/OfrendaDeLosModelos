import { LogitsProcessor, type Tensor } from "@huggingface/transformers";

import { StepRecorder } from "./ghost-words.js";

/**
 * Glue between `StepRecorder` and transformers.js 4.3.1: `generate({ logits_processor: [...] })`
 * appends these processors after the library's own (blocked words, temperature), and each is
 * called once per step with `logits` as a [batch, vocab] tensor, before the next token is
 * sampled (node_modules/@huggingface/transformers/src/models/modeling_utils.js,
 * `_get_logits_processor` and the generate loop). Batch size is always 1 here.
 */
export class RecordingProcessor extends LogitsProcessor {
  constructor(private readonly recorder: StepRecorder) {
    super();
  }

  override _call(_inputIds: bigint[][], logits: Tensor): Tensor {
    if (logits.dims[0] !== 1) throw new Error("Ghost words support a batch size of 1 only.");
    const data = logits.data;
    if (!(data instanceof Float32Array)) throw new Error("Expected float32 logits.");
    this.recorder.apply(data);
    return logits;
  }
}
