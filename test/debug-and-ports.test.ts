import { describe, expect, it } from "vitest";

import { debugRequested, withDebugLogging } from "../src/debug/debug-log.js";
import { buildRitualPlan } from "../src/ritual/plan.js";
import { createFakeWorker } from "../src/fake/fake-worker.js";
import type {
  ModelWorkerPort,
  UiToWorkerMessage,
  WorkerToUiMessage,
} from "../src/worker/protocol.js";
import { lazyPort } from "../src/worker/worker-port.js";
import { loadTestData, settle } from "./helpers.js";

function manualPort(): ModelWorkerPort & {
  readonly posted: UiToWorkerMessage[];
  emit(message: WorkerToUiMessage): void;
} {
  const listeners = new Set<(m: WorkerToUiMessage) => void>();
  const posted: UiToWorkerMessage[] = [];
  return {
    posted,
    post: (message) => posted.push(message),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(message) {
      for (const listener of listeners) listener(message);
    },
  };
}

describe("?debug (NFR-007)", () => {
  it("is requested by the query string only", () => {
    expect(debugRequested("?debug")).toBe(true);
    expect(debugRequested("?a=1&debug=1")).toBe(true);
    expect(debugRequested("")).toBe(false);
    expect(debugRequested("?nodebug")).toBe(false);
  });

  it("logs load time, size, device, tokens per second and errors, never the text", () => {
    let time = 0;
    const info: string[] = [];
    const errors: string[] = [];
    const inner = manualPort();
    const port = withDebugLogging(
      inner,
      { info: (m) => info.push(m), error: (m) => errors.push(m) },
      { now: () => time },
    );

    port.post({ type: "load", modelId: "gpt-2" });
    time = 1000;
    inner.emit({ type: "progress", modelId: "gpt-2", loaded: 130_000_000, total: 130_000_000 });
    time = 3500;
    inner.emit({ type: "ready", modelId: "gpt-2", device: "webgpu", dtype: "fp16" });
    expect(info[0]).toBe("[ofrenda] gpt-2 ready in 3.50 s (on webgpu, fp16, 130.0 MB)");

    time = 4000;
    port.post({
      type: "generate",
      requestId: "r1",
      modelId: "gpt-2",
      prompt: "my secret question",
      settings: null,
    });
    time = 4500;
    inner.emit({ type: "token", requestId: "r1", text: "a secret answer" });
    time = 5500;
    inner.emit({ type: "token", requestId: "r1", text: " more" });
    time = 6500;
    inner.emit({ type: "token", requestId: "r1", text: " tokens" });
    inner.emit({ type: "done", requestId: "r1" });
    expect(info[1]).toBe(
      "[ofrenda] gpt-2 answered: 3 tokens, first token after 0.50 s, 1.0 tokens/s",
    );

    inner.emit({ type: "error", modelId: "gpt-2", message: "no pinned revision" });
    expect(errors).toEqual(["[ofrenda] gpt-2 error: no pinned revision"]);
    expect([...info, ...errors].join("\n")).not.toMatch(/secret/);
    expect(inner.posted).toHaveLength(2);
  });
});

describe("lazyPort", () => {
  it("does not create the worker until the first message, then fans messages out", async () => {
    let created = 0;
    const inner = manualPort();
    const port = lazyPort(() => {
      created += 1;
      return inner;
    });
    const received: WorkerToUiMessage[] = [];
    const unsubscribe = port.subscribe((m) => received.push(m));
    expect(created).toBe(0);
    port.post({ type: "load", modelId: "gpt-2" });
    port.post({ type: "cancel-load", modelId: "gpt-2" });
    expect(created).toBe(1);
    expect(inner.posted).toHaveLength(2);
    inner.emit({ type: "ready", modelId: "gpt-2" });
    expect(received).toEqual([{ type: "ready", modelId: "gpt-2" }]);
    unsubscribe();
    inner.emit({ type: "ready", modelId: "gpt-2" });
    expect(received).toHaveLength(1);
    await settle();
  });
});

describe("the ritual plan for GPT-2", () => {
  it("passes GPT-2's source and settings from ancestors.json and labels it unfiltered", async () => {
    const data = await loadTestData();
    const worker = createFakeWorker();
    const posted: UiToWorkerMessage[] = [];
    const spy: ModelWorkerPort = {
      post: (m) => {
        posted.push(m);
        worker.post(m);
      },
      subscribe: (l) => worker.subscribe(l),
    };
    const steps = buildRitualPlan(data.ancestors, {
      worker: spy,
      recorded: { lookup: () => null },
      includeMedium: false,
    });
    expect(steps[0]?.info.caveat).toBe("Unfiltered 2019 model");
    expect(steps.slice(1).every((s) => s.info.caveat === undefined)).toBe(true);
    const controller = new AbortController();
    const run = steps[0]?.run({
      question: { text: "Q", offeredId: null, lang: null },
      signal: controller.signal,
      emitToken: () => undefined,
      reportProgress: () => undefined,
      askConsent: () => Promise.resolve(true),
      previous: [],
    });
    run?.catch(() => undefined);
    controller.abort();
    expect(posted[0]).toEqual({
      type: "load",
      modelId: "gpt-2",
      source: {
        repositoryId: null,
        revision: null,
        dtypes: { webgpu: "fp16", wasm: "q8" },
      },
    });
  });
});
