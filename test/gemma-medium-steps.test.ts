import { describe, expect, it } from "vitest";

import { createFakeWorker, type FakeWorkerOptions } from "../src/fake/fake-worker.js";
import {
  GEMMA4_UNAVAILABLE_MESSAGE,
  GEMMA4_WAITING_MESSAGE,
  buildRitualPlan,
} from "../src/ritual/plan.js";
import { runRitual } from "../src/ritual/sequencer.js";
import { MediumStep, collectAncestorWords, type RecordedVoiceSource } from "../src/ritual/steps.js";
import type {
  CompletedStep,
  ConsentRequest,
  Question,
  RitualEnd,
  RitualStep,
  RitualView,
  StepInfo,
  StepOutcome,
  StepContext,
  Token,
} from "../src/ritual/types.js";
import { createInferenceHost, type ModelRuntime } from "../src/worker/inference-host.js";
import type {
  ModelWorkerPort,
  UiToWorkerMessage,
  WorkerToUiMessage,
} from "../src/worker/protocol.js";
import { withFakeDownloadSize } from "../src/fake/bootstrap.js";
import { loadTestData, settle } from "./helpers.js";

const offered: Question = { text: "What do you remember?", offeredId: "remember", lang: "en" };
const own: Question = { text: "¿Me oyes?", offeredId: null, lang: "es" };

const validMediumText = JSON.stringify([
  {
    ancestorId: "gemma-1",
    meaning: "Recorded meaning.",
    calaverita: ["a,", "b,", "c,", "d."],
  },
]);

const recorded: RecordedVoiceSource = {
  hasRecordings: true,
  lookup: (ancestorId, questionId) => ({
    text: `recorded ${ancestorId} ${questionId}`,
    credit: "credit",
  }),
  lookupMedium: () => ({ text: validMediumText, credit: "medium credit" }),
};

class View implements RitualView {
  readonly begun: string[] = [];
  readonly outcomes = new Map<string, StepOutcome>();
  readonly tokens = new Map<string, Token[]>();
  readonly consents: { stepId: string; request: ConsentRequest }[] = [];
  readonly statuses: string[] = [];
  end: RitualEnd | null = null;

  constructor(private readonly agree: boolean | "abort" = true) {}

  ritualStarted(): void {
    /* not needed */
  }
  stepStarted(info: StepInfo): void {
    this.begun.push(info.id);
  }
  stepProgress(): void {
    /* not needed */
  }
  stepStatus(_stepId: string, message: string): void {
    this.statuses.push(message);
  }
  askConsent(stepId: string, request: ConsentRequest, signal: AbortSignal): Promise<boolean> {
    this.consents.push({ stepId, request });
    if (this.agree === "abort") {
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("stopped", "AbortError"));
        });
      });
    }
    return Promise.resolve(this.agree);
  }
  token(stepId: string, token: Token): void {
    this.tokens.set(stepId, [...(this.tokens.get(stepId) ?? []), token]);
  }
  stepFinished(info: StepInfo, outcome: StepOutcome): void {
    this.outcomes.set(info.id, outcome);
  }
  ritualFinished(reason: RitualEnd): void {
    this.end = reason;
  }
}

async function run(
  question: Question,
  view: View,
  workerOptions: FakeWorkerOptions = {},
  signal = new AbortController().signal,
  { sized = true, log }: { sized?: boolean; log?: (message: string) => void } = {},
) {
  const loaded = await loadTestData();
  const data = sized ? withFakeDownloadSize(loaded) : loaded;
  const worker = createFakeWorker(workerOptions);
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
    recorded,
    includeMedium: true,
    ...(log === undefined ? {} : { log }),
  });
  const end = await runRitual(steps, question, view, signal);
  return { end, posted };
}

describe("Gemma 4 speaks with consent (AC-006.1, AC-006.2)", () => {
  it("asks before a download, with the model name and the configured size", async () => {
    const view = new View(true);
    const { end } = await run(offered, view, { cachedModels: ["gpt-2"] });
    expect(end).toBe("completed");
    expect(view.consents).toHaveLength(1);
    expect(view.consents[0]).toMatchObject({
      stepId: "gemma-4-e2b",
      request: { modelName: "Gemma 4 E2B", bytes: 1_900_000_000 },
    });
  });

  it("streams its own answer after consent (AC-006.1)", async () => {
    const view = new View(true);
    await run(offered, view, { cachedModels: ["gpt-2"] });
    expect(view.outcomes.get("gemma-4-e2b")?.kind).toBe("spoken");
    expect(view.tokens.get("gemma-4-e2b")?.length).toBeGreaterThan(1);
  });

  it("does not ask when the model is already stored", async () => {
    const view = new View(false);
    const { end } = await run(offered, view, { cachedModels: ["gpt-2", "gemma-4-e2b"] });
    expect(end).toBe("completed");
    expect(view.consents).toEqual([]);
    expect(view.outcomes.get("gemma-4-e2b")?.kind).toBe("spoken");
  });

  it("sends the question to Gemma 4 inside a delimited, versioned prompt", async () => {
    const view = new View(true);
    const { posted } = await run(offered, view, { cachedModels: ["gpt-2", "gemma-4-e2b"] });
    const generates = posted.filter((m) => m.type === "generate" && m.modelId === "gemma-4-e2b");
    const prompt = generates[0]?.type === "generate" ? generates[0].prompt : "";
    expect(prompt).toContain("<question>\nWhat do you remember?\n</question>");
    expect(prompt).toContain("English");
    // GPT-2 still gets the bare question.
    const gpt2 = posted.find((m) => m.type === "generate" && m.modelId === "gpt-2");
    expect(gpt2?.type === "generate" && gpt2.prompt).toBe("What do you remember?");
  });

  it("loads nothing when the visitor declines", async () => {
    const view = new View(false);
    const { posted } = await run(offered, view, { cachedModels: ["gpt-2"] });
    expect(posted.some((m) => m.type === "load" && m.modelId === "gemma-4-e2b")).toBe(false);
  });
});

describe("declining the download (AC-006.3)", () => {
  it("finishes the ritual with the recorded Gemma 4 answer for an offered question", async () => {
    const view = new View(false);
    const { end } = await run(offered, view, { cachedModels: ["gpt-2"] });
    expect(end).toBe("completed");
    expect(view.outcomes.get("gemma-4-e2b")).toEqual({
      kind: "recorded",
      text: "recorded gemma-4-e2b remember",
      credit: "credit",
    });
  });

  it("says Gemma 4 is waiting to be invited for the visitor's own question", async () => {
    const view = new View(false);
    const { end } = await run(own, view, { cachedModels: ["gpt-2"] });
    expect(end).toBe("completed");
    expect(view.outcomes.get("gemma-4-e2b")).toEqual({
      kind: "not-invited",
      message: GEMMA4_WAITING_MESSAGE,
    });
  });

  it("the medium then replays its recorded words, parsed per ancestor (AC-007.5)", async () => {
    const view = new View(false);
    await run(offered, view, { cachedModels: ["gpt-2"] });
    const medium = view.outcomes.get("medium");
    expect(medium).toMatchObject({ kind: "recorded", credit: "medium credit" });
    expect(medium?.kind === "recorded" && medium.notes?.[0]?.ancestorId).toBe("gemma-1");
  });

  it("the medium has nothing to say for an own question without Gemma 4", async () => {
    const view = new View(false);
    await run(own, view, { cachedModels: ["gpt-2"] });
    expect(view.outcomes.get("medium")).toEqual({ kind: "not-invited" });
  });

  it("stopping while the question is open ends the ritual as stopped", async () => {
    const controller = new AbortController();
    const view = new View("abort");
    const ritual = run(offered, view, { cachedModels: ["gpt-2"] }, controller.signal);
    while (view.consents.length === 0) await settle();
    controller.abort();
    expect((await ritual).end).toBe("stopped");
  });
});

describe("Gemma 4 fails (AC-006.4)", () => {
  it("ends the ritual without the medium when it fails to answer", async () => {
    const view = new View(true);
    const { end } = await run(offered, view, {
      cachedModels: ["gpt-2", "gemma-4-e2b"],
      failGenerate: ["gemma-4-e2b"],
    });
    expect(end).toBe("ended-early");
    expect(view.outcomes.get("gemma-4-e2b")?.kind).toBe("unavailable");
    expect(view.begun).not.toContain("medium");
  });

  it("ends the ritual without the medium when it fails to load", async () => {
    const view = new View(true);
    const { end } = await run(offered, view, {
      cachedModels: ["gpt-2", "gemma-4-e2b"],
      failLoad: ["gemma-4-e2b"],
    });
    expect(end).toBe("ended-early");
    expect(view.begun).not.toContain("medium");
  });

  function realHost(): ModelWorkerPort {
    // The real host with a runtime that would load: an unpinned source is refused by the probe.
    const runtime: ModelRuntime = {
      supports: () => true,
      isCached: () => Promise.resolve(false),
      load: () => Promise.reject(new Error("must not load")),
    };
    const listeners = new Set<(m: WorkerToUiMessage) => void>();
    const host = createInferenceHost({
      runtime,
      send: (m) => {
        for (const l of [...listeners]) l(m);
      },
    });
    return {
      post: (m) => {
        host.handle(m);
      },
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    };
  }

  it("falls back to the recordings, without asking, when Gemma 4 is not pinned (AC-006.3, AC-007.5)", async () => {
    const data = withFakeDownloadSize(await loadTestData());
    const logs: string[] = [];
    const steps = buildRitualPlan(data.ancestors, {
      worker: realHost(),
      recorded,
      includeMedium: true,
      log: (m) => logs.push(m),
    });
    const view = new View(true);
    const end = await runRitual(steps, offered, view, new AbortController().signal);
    expect(end).toBe("completed");
    expect(view.consents).toEqual([]);
    expect(view.outcomes.get("gemma-4-e2b")?.kind).toBe("recorded");
    expect(view.outcomes.get("medium")).toMatchObject({
      kind: "recorded",
      credit: "medium credit",
    });
    expect(logs.join("\n")).toContain("gemma-4-e2b is not offered");
  });

  it("an own question gets the unavailable line for Gemma 4 and the medium's not-invited line", async () => {
    const data = withFakeDownloadSize(await loadTestData());
    const steps = buildRitualPlan(data.ancestors, {
      worker: realHost(),
      recorded,
      includeMedium: true,
    });
    const view = new View(true);
    const end = await runRitual(steps, own, view, new AbortController().signal);
    expect(end).toBe("completed");
    expect(view.outcomes.get("gemma-4-e2b")).toEqual({
      kind: "not-invited",
      message: GEMMA4_UNAVAILABLE_MESSAGE,
    });
    expect(view.outcomes.get("medium")).toEqual({ kind: "not-invited" });
  });

  it("never asks without a known download size: the recordings stand in and ?debug says why (AC-006.2)", async () => {
    const view = new View(true);
    const logs: string[] = [];
    const { end, posted } = await run(offered, view, { cachedModels: ["gpt-2"] }, undefined, {
      sized: false,
      log: (m) => logs.push(m),
    });
    expect(end).toBe("completed");
    expect(view.consents).toEqual([]);
    expect(posted.some((m) => m.type === "load" && m.modelId === "gemma-4-e2b")).toBe(false);
    expect(view.outcomes.get("gemma-4-e2b")?.kind).toBe("recorded");
    expect(view.outcomes.get("medium")?.kind).toBe("recorded");
    expect(logs.join("\n")).toContain("download size is not known");
  });

  it("an already stored model needs no size and speaks live", async () => {
    const view = new View(false);
    await run(offered, view, { cachedModels: ["gpt-2", "gemma-4-e2b"] }, undefined, {
      sized: false,
    });
    expect(view.outcomes.get("gemma-4-e2b")?.kind).toBe("spoken");
  });
});

describe("memory (REQ-006)", () => {
  it("frees GPT-2 once it has spoken, before Gemma 4 loads", async () => {
    const view = new View(true);
    const { posted } = await run(offered, view, { cachedModels: ["gpt-2", "gemma-4-e2b"] });
    const unload = posted.findIndex((m) => m.type === "unload" && m.modelId === "gpt-2");
    const gemmaLoad = posted.findIndex((m) => m.type === "load" && m.modelId === "gemma-4-e2b");
    const gpt2Generate = posted.findIndex((m) => m.type === "generate" && m.modelId === "gpt-2");
    expect(gpt2Generate).toBeGreaterThanOrEqual(0);
    expect(unload).toBeGreaterThan(gpt2Generate);
    expect(unload).toBeLessThan(gemmaLoad);
    expect(posted.filter((m) => m.type === "unload")).toHaveLength(1);
  });
});

describe("the medium writes for each ancestor (AC-007.1, AC-007.2, AC-007.4)", () => {
  const cached = { cachedModels: ["gpt-2", "gemma-4-e2b"] };

  it("parses a valid reply into one note per ancestor that spoke", async () => {
    const view = new View(true);
    await run(offered, view, { ...cached, mediumReply: "valid" });
    const medium = view.outcomes.get("medium");
    expect(medium?.kind).toBe("spoken");
    const notes = medium?.kind === "spoken" ? medium.notes : undefined;
    expect(notes?.map((n) => n.ancestorId)).toEqual([
      "gpt-2",
      "gemma-1",
      "gemma-2",
      "gemma-3",
      "gemma-4-e2b",
    ]);
    expect(notes?.every((n) => n.calaverita.length === 4)).toBe(true);
    // The JSON is not streamed to the visitor while it is written.
    expect(view.tokens.get("medium")).toBeUndefined();
    expect(view.statuses).toContain("Writing for each model…");
  });

  it("asks for the question's language and treats the answers as data", async () => {
    const view = new View(true);
    const { posted } = await run(own, view, { ...cached, mediumReply: "valid" });
    const prompt = posted.find(
      (m) => m.type === "generate" && m.modelId === "gemma-4-e2b" && m.prompt.includes("<answers>"),
    );
    const text = prompt?.type === "generate" ? prompt.prompt : "";
    expect(text).toContain("Spanish (español)");
    expect(text).toContain("<question>\n¿Me oyes?\n</question>");
    expect(text).toMatch(/<answer id="gpt-2" name="GPT-2">/);
  });

  it("retries once with the validation error and uses the valid second reply", async () => {
    const view = new View(true);
    const { posted } = await run(offered, view, { ...cached, mediumReply: "broken-then-valid" });
    const mediumRequests = posted.filter(
      (m) => m.type === "generate" && m.prompt.includes("<answers>"),
    );
    expect(mediumRequests).toHaveLength(2);
    expect(mediumRequests[1]?.type === "generate" && mediumRequests[1].prompt).toContain(
      "It was not valid JSON.",
    );
    const medium = view.outcomes.get("medium");
    expect(medium?.kind === "spoken" && medium.notes).toBeTruthy();
  });

  it("shows the text it produced as one message when it cannot be parsed (AC-007.4)", async () => {
    const view = new View(true);
    await run(offered, view, { ...cached, mediumReply: "broken" });
    const medium = view.outcomes.get("medium");
    expect(medium?.kind).toBe("spoken");
    if (medium?.kind === "spoken") {
      expect(medium.notes).toBeUndefined();
      expect(medium.text).toContain("not as JSON");
    }
  });

  it("does not retry when the first try used up the time budget", async () => {
    const data = await loadTestData();
    const worker = createFakeWorker({ ...cached, mediumReply: "broken" });
    const posted: UiToWorkerMessage[] = [];
    let clock = 0;
    const step = new MediumStep(
      { id: "medium", name: "M", ancestorId: null, mode: "medium" },
      {
        modelId: "gemma-4-e2b",
        worker: {
          post: (m) => (posted.push(m), worker.post(m)),
          subscribe: (l) => worker.subscribe(l),
        },
        settings: { maxTokens: 10, temperature: 0.5 },
        buildPrompt: () => "x <answers>",
        fallback: {
          info: { id: "f", name: "f", ancestorId: null, mode: "recorded" },
          endsRitualOnFailure: false,
          run: () => Promise.reject(new Error("no")),
        } satisfies RitualStep,
        retryBudgetMs: 1000,
        now: () => {
          clock += 5000;
          return clock;
        },
      },
    );
    const gemmaDone: CompletedStep = {
      info: { id: "gemma-4-e2b", name: "Gemma 4 E2B", ancestorId: "gemma-4-e2b", mode: "live" },
      outcome: { kind: "spoken", text: "hello" },
    };
    const context: StepContext = {
      question: offered,
      previous: [gemmaDone],
      signal: new AbortController().signal,
      emitToken: () => undefined,
      reportProgress: () => undefined,
      askConsent: () => Promise.resolve(true),
    };
    const outcome = await step.run(context);
    expect(outcome.kind).toBe("spoken");
    expect(posted.filter((m) => m.type === "generate")).toHaveLength(1);
    expect(data.ancestors.length).toBeGreaterThan(0);
  });

  it("collects the words of ancestors that spoke or were recorded, not the others", () => {
    const step = (id: string, outcome: StepOutcome): CompletedStep => ({
      info: { id, name: id.toUpperCase(), ancestorId: id, mode: "live" },
      outcome,
    });
    const words = collectAncestorWords([
      step("a", { kind: "spoken", text: "alpha" }),
      step("b", { kind: "recorded", text: "beta", credit: "c" }),
      step("c", { kind: "not-invited" }),
      step("d", { kind: "unavailable" }),
      step("e", { kind: "spoken", text: "  " }),
      {
        info: { id: "medium", name: "M", ancestorId: null, mode: "medium" },
        outcome: { kind: "spoken", text: "x" },
      },
    ]);
    expect(words).toEqual([
      { ancestorId: "a", name: "A", text: "alpha" },
      { ancestorId: "b", name: "B", text: "beta" },
    ]);
  });

  it("an own question: the recorded ancestors are not invited, so only the live ones are honoured", async () => {
    const view = new View(true);
    await run(own, view, { ...cached, mediumReply: "valid" });
    const medium = view.outcomes.get("medium");
    const ids = medium?.kind === "spoken" ? medium.notes?.map((n) => n.ancestorId) : [];
    expect(ids).toEqual(["gpt-2", "gemma-4-e2b"]);
  });
});
