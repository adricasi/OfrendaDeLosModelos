import { NoBadWordsLogitsProcessor, Tensor } from "@huggingface/transformers";
import { describe, expect, it } from "vitest";

import { blockedTokenSequences } from "../src/worker/blocked-tokens.js";
import { StepRecorder, ghostAlternatives, topCandidates } from "../src/worker/ghost-words.js";
import { RecordingProcessor } from "../src/worker/recording-processor.js";
import { TokenTextAssembler } from "../src/worker/token-text.js";

function softmax(values: number[], temperature: number): number[] {
  const scaled = values.map((v) => v / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

const LOGITS = [1, 4, 2, 3, 0, -1];

describe("top-k extraction from logits (AC-004.1, AC-004.3)", () => {
  it("returns the most likely ids first, with the softmax probability over the whole vocabulary", () => {
    const expected = softmax(LOGITS, 1);
    const top = topCandidates(LOGITS, 1, 3);
    expect(top.map((c) => c.id)).toEqual([1, 3, 2]);
    expect(top[0]?.p).toBeCloseTo(expected[1] ?? 0, 10);
    expect(top[1]?.p).toBeCloseTo(expected[3] ?? 0, 10);
    expect(top[2]?.p).toBeCloseTo(expected[2] ?? 0, 10);
  });

  it("probabilities of all tokens sum to 1", () => {
    const all = topCandidates(LOGITS, 1, LOGITS.length);
    expect(all.reduce((sum, c) => sum + c.p, 0)).toBeCloseTo(1, 10);
  });

  it("applies the sampling temperature before the softmax", () => {
    const expected = softmax(LOGITS, 0.5);
    const top = topCandidates(LOGITS, 0.5, 2);
    expect(top[0]?.p).toBeCloseTo(expected[1] ?? 0, 10);
    expect(top[1]?.p).toBeCloseTo(expected[3] ?? 0, 10);
    // A lower temperature makes the favourite more certain.
    expect(top[0]?.p ?? 0).toBeGreaterThan(topCandidates(LOGITS, 1, 1)[0]?.p ?? 1);
  });

  it("never returns tokens with probability 0 (blocked tokens have -Infinity)", () => {
    const top = topCandidates([5, -Infinity, 4, -Infinity], 1, 4);
    expect(top.map((c) => c.id)).toEqual([0, 2]);
  });

  it("is stable when logits are large", () => {
    const top = topCandidates([1000, 999, 998], 1, 3);
    expect(top.map((c) => c.p).every(Number.isFinite)).toBe(true);
    expect(top[0]?.p).toBeCloseTo(softmax([1000, 999, 998], 1)[0] ?? 0, 10);
  });

  it("rejects a temperature that is not positive", () => {
    expect(() => topCandidates(LOGITS, 0)).toThrow(RangeError);
  });
});

describe("ghost alternatives (AC-004.1, AC-004.3)", () => {
  const words = new Map([
    [0, "zero"],
    [1, " one"],
    [2, " two"],
    [3, " three"],
    [4, " four"],
    [5, "�"],
  ]);
  const decode = (id: number): string => words.get(id) ?? "";
  const candidates = [1, 3, 2, 5, 4, 0].map((id, index) => ({ id, p: 0.5 / (index + 1) }));

  it("excludes the chosen token and keeps at most three, most likely first", () => {
    const result = ghostAlternatives(candidates, 1, decode);
    expect(result.map((a) => a.text)).toEqual([" three", " two", " four"]);
    expect(result.map((a) => a.p)).toEqual([0.25, 0.5 / 3, 0.5 / 5]);
  });

  it("skips tokens that are not displayable text on their own", () => {
    const result = ghostAlternatives(candidates, 99, decode);
    expect(result.map((a) => a.text)).not.toContain("�");
    expect(result).toHaveLength(3);
  });

  it("returns fewer than three when the model had fewer candidates", () => {
    expect(ghostAlternatives(candidates.slice(0, 2), 1, decode)).toHaveLength(1);
  });

  it("uses only ids from the candidates it was given", () => {
    const given = new Set(candidates.map((c) => c.id));
    const decoded: number[] = [];
    ghostAlternatives(candidates, 1, (id) => {
      decoded.push(id);
      return decode(id);
    });
    expect(decoded.every((id) => given.has(id))).toBe(true);
  });
});

describe("StepRecorder", () => {
  it("records the step's candidates and then applies the temperature to the logits", () => {
    const logits = new Float32Array([2, 4, 0]);
    const recorder = new StepRecorder(2);
    recorder.apply(logits);
    expect([...logits]).toEqual([1, 2, 0]);
    const taken = recorder.take();
    expect(taken[0]?.id).toBe(1);
    expect(taken[0]?.p).toBeCloseTo(softmax([2, 4, 0], 2)[1] ?? 0, 6);
    expect(recorder.take()).toEqual([]);
  });

  it("leaves the logits alone at temperature 1", () => {
    const logits = new Float32Array([2, 4, 0]);
    new StepRecorder(1).apply(logits);
    expect([...logits]).toEqual([2, 4, 0]);
  });

  it("sampling the scaled logits has the recorded probabilities", () => {
    const logits = new Float32Array([3, 1, 0, -2]);
    const recorder = new StepRecorder(0.7);
    recorder.apply(logits);
    const resampled = softmax([...logits], 1);
    const recorded = recorder.take();
    for (const candidate of recorded) {
      expect(candidate.p).toBeCloseTo(resampled[candidate.id] ?? 0, 5);
    }
  });
});

describe("the recording processor inside transformers.js 4.3.1", () => {
  it("is called with a [1, vocab] tensor and records before sampling", () => {
    const recorder = new StepRecorder(1);
    const processor = new RecordingProcessor(recorder);
    const logits = new Tensor("float32", new Float32Array([0, 3, 1, 2]), [1, 4]);
    const out: unknown = processor([[1n]], logits);
    expect(out).toBe(logits);
    expect(recorder.take().map((c) => c.id)).toEqual([1, 3, 2, 0]);
  });

  it("refuses a batch larger than 1", () => {
    const processor = new RecordingProcessor(new StepRecorder(1));
    const logits = new Tensor("float32", new Float32Array(8), [2, 4]);
    expect(() => {
      processor([[1n], [1n]], logits);
    }).toThrow(/batch/);
  });
});

describe("blocked-token list (AC-003.4)", () => {
  // A toy tokenizer: each character is one token, so words are multi-token sequences.
  const encode = (text: string): number[] => [...text].map((c) => c.codePointAt(0) ?? 0);

  it("builds sequences for the spellings seen at the start of a word", () => {
    const sequences = blockedTokenSequences(["bad"], encode).map((s) => String.fromCodePoint(...s));
    expect(sequences.toSorted()).toEqual([" BAD", " Bad", " bad", "BAD", "Bad", "bad"].toSorted());
  });

  it("skips blank words and removes duplicates", () => {
    expect(blockedTokenSequences(["", "  "], encode)).toEqual([]);
    expect(blockedTokenSequences(["a", "a"], encode)).toHaveLength(4);
  });

  it("makes the library's own processor set the blocked token's logit to -Infinity", () => {
    // Vocabulary of 8 ids; "bad" is the id sequence [1, 2, 3] in this fake tokenizer.
    const sequences = blockedTokenSequences(["bad"], (text) =>
      text === "bad" ? [1, 2, 3] : text === " bad" ? [7, 2, 3] : [],
    );
    expect(sequences).toEqual([
      [1, 2, 3],
      [7, 2, 3],
    ]);
    const processor = new NoBadWordsLogitsProcessor(sequences, 0);
    const recorder = new StepRecorder(1);

    // After "... 1 2" the next token 3 would complete the word: it is blocked.
    const logits = new Tensor("float32", new Float32Array([0, 1, 1, 9, 1, 1, 1, 1]), [1, 8]);
    const blockedStep: unknown = processor([[5n, 1n, 2n]], logits);
    new RecordingProcessor(recorder)([[5n, 1n, 2n]], blockedStep);
    const candidates = recorder.take();
    expect(candidates.map((c) => c.id)).not.toContain(3);
    expect(candidates.every((c) => c.p > 0)).toBe(true);

    // Elsewhere token 3 stays possible.
    const free = new Tensor("float32", new Float32Array([0, 1, 1, 9, 1, 1, 1, 1]), [1, 8]);
    const freeStep: unknown = processor([[5n, 4n, 2n]], free);
    new RecordingProcessor(recorder)([[5n, 4n, 2n]], freeStep);
    expect(recorder.take()[0]?.id).toBe(3);
  });
});

describe("token text assembly", () => {
  const bytes = new Map<number, string>([
    [1, "Hello"],
    [2, " wor"],
    [3, "ld"],
  ]);
  const decodeAll = (ids: readonly number[]): string =>
    ids.map((id) => bytes.get(id) ?? "").join("");

  it("returns the text each token adds", () => {
    const assembler = new TokenTextAssembler(decodeAll);
    expect([assembler.push(1), assembler.push(2), assembler.push(3)]).toEqual([
      "Hello",
      " wor",
      "ld",
    ]);
  });

  it("holds back a character that is still incomplete and delivers it with the next token", () => {
    const pieces = new Map<number, string>([
      [10, "caf"],
      [11, "Ã"],
      [12, "©"],
    ]);
    // Ids 11+12 together decode to "é"; id 11 alone is an incomplete sequence.
    const decode = (ids: readonly number[]): string => {
      const tail = ids.slice(-2);
      if (ids.at(-1) === 11)
        return `${ids
          .slice(0, -1)
          .map((i) => pieces.get(i) ?? "")
          .join("")}�`;
      if (tail[0] === 11 && tail[1] === 12) return "café";
      return ids.map((i) => pieces.get(i) ?? "").join("");
    };
    const assembler = new TokenTextAssembler(decode);
    expect(assembler.push(10)).toBe("caf");
    expect(assembler.push(11)).toBe("");
    expect(assembler.push(12)).toBe("é");
  });
});
