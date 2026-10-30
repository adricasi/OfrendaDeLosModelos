import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  createInferenceHost,
  pinnedSource,
  type GenerateParams,
  type LoadedModel,
  type ModelRuntime,
  type PinnedSource,
} from "../src/worker/inference-host.js";
import type { ModelSource, WorkerToUiMessage } from "../src/worker/protocol.js";
import { settle } from "./helpers.js";

const REVISION = "a".repeat(40);
const SOURCE: ModelSource = {
  repositoryId: "owner/gpt2-onnx",
  revision: REVISION,
  dtypes: { wasm: "q8" },
};

interface Harness {
  readonly sent: WorkerToUiMessage[];
  readonly loads: PinnedSource[];
  readonly backends: (string | undefined)[];
  readonly disposed: string[];
  readonly generations: GenerateParams[];
  releaseLoad(): void;
  host: ReturnType<typeof createInferenceHost>;
}

function harness(options: { holdLoad?: boolean; failGenerate?: boolean } = {}): Harness {
  const sent: WorkerToUiMessage[] = [];
  const loads: PinnedSource[] = [];
  const backends: (string | undefined)[] = [];
  const disposed: string[] = [];
  const generations: GenerateParams[] = [];
  let release: () => void = () => undefined;
  const runtime: ModelRuntime = {
    supports: (id) => id === "gpt-2",
    async load(modelId, source, onProgress, backend): Promise<LoadedModel> {
      loads.push(source);
      backends.push(backend);
      onProgress(10, 100);
      if (options.holdLoad === true) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      onProgress(100, 100);
      return {
        device: "wasm",
        dtype: "q8",
        async generate(params): Promise<void> {
          generations.push(params);
          if (options.failGenerate === true) throw new Error("boom");
          params.onToken({ text: "Hi", alternatives: [{ text: " Hello", p: 0.2 }] });
          await settle();
          params.onToken({ text: " there" });
          await settle();
        },
        dispose(): Promise<void> {
          disposed.push(modelId);
          return Promise.resolve();
        },
      };
    },
  };
  const host = createInferenceHost({
    runtime,
    send: (message) => sent.push(message),
  });
  return { sent, loads, backends, disposed, generations, releaseLoad: () => release(), host };
}

const types = (h: Harness): string[] => h.sent.map((m) => m.type);

describe("pinned sources (AC-003.3)", () => {
  it("accepts a repository id with a full commit hash", () => {
    expect(pinnedSource(SOURCE)).toEqual({
      repositoryId: "owner/gpt2-onnx",
      revision: REVISION,
      dtypes: { wasm: "q8" },
    });
  });

  it.each([
    ["no source", undefined],
    ["a null repository", { ...SOURCE, repositoryId: null }],
    ["a null revision", { ...SOURCE, revision: null }],
    ["a branch name", { ...SOURCE, revision: "main" }],
    ["a short hash", { ...SOURCE, revision: "abc1234" }],
    ["a malformed repository", { ...SOURCE, repositoryId: "https://evil.example/x" }],
  ])("refuses %s", (_name, source) => {
    expect(() => pinnedSource(source)).toThrow();
  });
});

describe("inference worker message handling", () => {
  it("refuses to load a model without a pinned revision and reports it for that model", async () => {
    const h = harness();
    h.host.handle({
      type: "load",
      modelId: "gpt-2",
      source: { repositoryId: null, revision: null, dtypes: null },
    });
    await settle();
    expect(h.loads).toEqual([]);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ type: "error", modelId: "gpt-2" });
  });

  it("refuses a model it has no runtime for", async () => {
    const h = harness();
    h.host.handle({ type: "load", modelId: "gemma-4-e2b", source: SOURCE });
    await settle();
    expect(h.sent[0]).toMatchObject({ type: "error", modelId: "gemma-4-e2b" });
  });

  it("loads with progress, then reports ready with the device and dtype", async () => {
    const h = harness();
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle(2);
    expect(h.loads).toHaveLength(1);
    expect(h.sent).toEqual([
      { type: "progress", modelId: "gpt-2", loaded: 10, total: 100 },
      { type: "progress", modelId: "gpt-2", loaded: 100, total: 100 },
      { type: "ready", modelId: "gpt-2", device: "wasm", dtype: "q8" },
    ]);
  });

  it("answers ready again when an already loaded model is loaded again", async () => {
    const h = harness();
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle(2);
    h.sent.length = 0;
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle(2);
    expect(types(h)).toEqual(["ready"]);
    expect(h.loads).toHaveLength(1);
  });

  it("streams tokens with alternatives, then done, using the settings it was given", async () => {
    const h = harness();
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle(2);
    h.sent.length = 0;
    h.host.handle({
      type: "generate",
      requestId: "r1",
      modelId: "gpt-2",
      prompt: "Q",
      settings: { maxTokens: 12, temperature: 0.3 },
    });
    await settle(4);
    expect(h.sent).toEqual([
      {
        type: "token",
        requestId: "r1",
        text: "Hi",
        alternatives: [{ text: " Hello", p: 0.2 }],
      },
      { type: "token", requestId: "r1", text: " there" },
      { type: "done", requestId: "r1" },
    ]);
    expect(h.generations[0]?.settings).toEqual({ maxTokens: 12, temperature: 0.3 });
    expect(h.generations[0]?.prompt).toBe("Q");
  });

  it("falls back to the default settings (60 tokens, AC-003.2)", async () => {
    const h = harness();
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle(2);
    h.host.handle({
      type: "generate",
      requestId: "r1",
      modelId: "gpt-2",
      prompt: "Q",
      settings: null,
    });
    await settle(4);
    expect(h.generations[0]?.settings).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.maxTokens).toBe(60);
  });

  it("reports a failed generation as an error for that request, with no done", async () => {
    const h = harness({ failGenerate: true });
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle(2);
    h.sent.length = 0;
    h.host.handle({
      type: "generate",
      requestId: "r1",
      modelId: "gpt-2",
      prompt: "Q",
      settings: null,
    });
    await settle(3);
    expect(h.sent).toEqual([{ type: "error", requestId: "r1", message: "boom" }]);
  });

  it("errors when generating before the model was loaded", async () => {
    const h = harness();
    h.host.handle({
      type: "generate",
      requestId: "r1",
      modelId: "gpt-2",
      prompt: "Q",
      settings: null,
    });
    await settle();
    expect(h.sent[0]).toMatchObject({ type: "error", requestId: "r1" });
  });

  it("cancel aborts the generation and the answer ends silently", async () => {
    const h = harness();
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle(2);
    h.sent.length = 0;
    h.host.handle({
      type: "generate",
      requestId: "r1",
      modelId: "gpt-2",
      prompt: "Q",
      settings: null,
    });
    await settle();
    h.host.handle({ type: "cancel", requestId: "r1" });
    await settle(4);
    expect(h.generations[0]?.signal.aborted).toBe(true);
    expect(types(h)).not.toContain("done");
    expect(types(h)).not.toContain("error");
    expect(h.sent.filter((m) => m.type === "token").length).toBeLessThanOrEqual(1);
  });
});

describe("backend choice (AC-010.1)", () => {
  it("passes the requested backend on to the runtime", async () => {
    const h = harness();
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE, backend: "wasm" });
    await settle(2);
    expect(h.backends).toEqual(["wasm"]);
  });

  it("leaves the choice to the runtime when none is requested", async () => {
    const h = harness();
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle(2);
    expect(h.backends).toEqual([undefined]);
  });
});

describe("cancel-load", () => {
  it("stops reporting, disposes the model when it finishes, and a later load starts afresh", async () => {
    const h = harness({ holdLoad: true });
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle();
    h.host.handle({ type: "cancel-load", modelId: "gpt-2" });
    h.sent.length = 0;
    h.releaseLoad();
    await settle(3);
    expect(h.sent).toEqual([]);
    expect(h.disposed).toEqual(["gpt-2"]);

    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle();
    expect(h.loads).toHaveLength(2);
    h.releaseLoad();
    await settle(3);
    expect(types(h)).toContain("ready");
  });

  it("is ignored for a model that is not loading or already loaded", async () => {
    const h = harness();
    h.host.handle({ type: "cancel-load", modelId: "gpt-2" });
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle(2);
    h.host.handle({ type: "cancel-load", modelId: "gpt-2" });
    h.sent.length = 0;
    h.host.handle({ type: "load", modelId: "gpt-2", source: SOURCE });
    await settle(2);
    expect(types(h)).toEqual(["ready"]);
    expect(h.disposed).toEqual([]);
  });
});
