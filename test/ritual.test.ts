import { describe, expect, it } from "vitest";

import { createFakeWorker, type FakeWorkerOptions } from "../src/fake/fake-worker.js";
import { buildRitualPlan, type RitualDependencies } from "../src/ritual/plan.js";
import { RitualRunner, runRitual } from "../src/ritual/sequencer.js";
import type {
  Question,
  RitualEnd,
  RitualView,
  StepInfo,
  StepOutcome,
  Token,
} from "../src/ritual/types.js";
import { WorkerVoiceStep, type RecordedVoiceSource } from "../src/ritual/steps.js";
import type { RitualStep } from "../src/ritual/types.js";
import type { UiToWorkerMessage } from "../src/worker/protocol.js";
import { loadTestData } from "./helpers.js";

const offered: Question = { text: "What do you remember?", offeredId: "remember", lang: "en" };
const own: Question = { text: "¿Me oyes?", offeredId: null, lang: "es" };

const recorded: RecordedVoiceSource = {
  lookup: (ancestorId, questionId) => ({
    text: `recorded ${ancestorId} ${questionId}`,
    credit: "credit",
  }),
};

class RecordingView implements RitualView {
  readonly events: string[] = [];
  readonly outcomes = new Map<string, StepOutcome>();
  readonly tokens = new Map<string, Token[]>();
  end: RitualEnd | null = null;
  onToken: (() => void) | null = null;

  ritualStarted(): void {
    this.events.push("start");
  }
  stepStarted(info: StepInfo): void {
    this.events.push(`begin:${info.id}`);
  }
  stepProgress(): void {
    /* not needed */
  }
  token(stepId: string, token: Token): void {
    this.tokens.set(stepId, [...(this.tokens.get(stepId) ?? []), token]);
    this.onToken?.();
  }
  stepFinished(info: StepInfo, outcome: StepOutcome): void {
    this.events.push(`end:${info.id}`);
    this.outcomes.set(info.id, outcome);
  }
  ritualFinished(reason: RitualEnd): void {
    this.end = reason;
    this.events.push(`finish:${reason}`);
  }
  get begun(): string[] {
    return this.events.filter((e) => e.startsWith("begin:")).map((e) => e.slice(6));
  }
}

async function setup(
  workerOptions: FakeWorkerOptions = {},
  overrides: Partial<RitualDependencies> = {},
) {
  const data = await loadTestData();
  const worker = createFakeWorker(workerOptions);
  const posted: UiToWorkerMessage[] = [];
  const spy = { ...worker, post: (m: UiToWorkerMessage) => (posted.push(m), worker.post(m)) };
  const steps = buildRitualPlan(data.ancestors, {
    worker: spy,
    recorded,
    includeMedium: true,
    ...overrides,
  });
  return { steps, posted, view: new RecordingView() };
}

describe("ritual order (design D-4)", () => {
  it("runs GPT-2, the recorded voices by age, Gemma 4, then the medium", async () => {
    const { steps, view } = await setup();
    const end = await runRitual(steps, offered, view, new AbortController().signal);
    expect(end).toBe("completed");
    expect(view.begun).toEqual(["gpt-2", "gemma-1", "gemma-2", "gemma-3", "gemma-4-e2b", "medium"]);
    expect(view.events[0]).toBe("start");
    expect(view.events.at(-1)).toBe("finish:completed");
  });

  it("does not start a step before the previous one has finished", async () => {
    const { steps, view } = await setup();
    await runRitual(steps, offered, view, new AbortController().signal);
    const ids = view.begun;
    for (const [index, id] of ids.entries()) {
      expect(view.events.indexOf(`end:${id}`)).toBeLessThan(
        view.events.indexOf(`begin:${ids[index + 1] ?? "none"}`) === -1
          ? Infinity
          : view.events.indexOf(`begin:${ids[index + 1] ?? "none"}`),
      );
    }
  });

  it("has no medium step until the medium exists", async () => {
    const { steps, view } = await setup({}, { includeMedium: false });
    await runRitual(steps, offered, view, new AbortController().signal);
    expect(view.begun.at(-1)).toBe("gemma-4-e2b");
  });

  it("streams live tokens with alternatives when the worker provides them", async () => {
    const { steps, view } = await setup({ alternativesFor: ["gpt-2"] });
    await runRitual(steps, offered, view, new AbortController().signal);
    expect(view.tokens.get("gpt-2")?.every((t) => t.alternatives?.length === 3)).toBe(true);
    expect(view.tokens.get("gemma-4-e2b")?.every((t) => t.alternatives === undefined)).toBe(true);
    const spoken = view.outcomes.get("gpt-2");
    expect(spoken?.kind === "spoken" && spoken.text).toBe(
      view.tokens
        .get("gpt-2")
        ?.map((t) => t.text)
        .join(""),
    );
  });

  it("replays the recorded answers of offered questions exactly (AC-005.1, AC-005.4)", async () => {
    const { steps, view } = await setup();
    await runRitual(steps, offered, view, new AbortController().signal);
    expect(view.outcomes.get("gemma-2")).toEqual({
      kind: "recorded",
      text: "recorded gemma-2 remember",
      credit: "credit",
    });
  });
});

describe("own questions (AC-005.3)", () => {
  it("shows that recorded ancestors only answer their own questions, and continues", async () => {
    const { steps, view } = await setup();
    const end = await runRitual(steps, own, view, new AbortController().signal);
    expect(end).toBe("completed");
    for (const id of ["gemma-1", "gemma-2", "gemma-3"]) {
      expect(view.outcomes.get(id)).toEqual({ kind: "not-invited" });
    }
    expect(view.outcomes.get("gpt-2")?.kind).toBe("spoken");
    expect(view.outcomes.get("gemma-4-e2b")?.kind).toBe("spoken");
    expect(view.outcomes.get("medium")?.kind).toBe("spoken");
  });
});

describe("failure isolation (AC-003.3, AC-006.4)", () => {
  it("lets GPT-2 fail while loading and continues the ritual", async () => {
    const { steps, view } = await setup({ failLoad: ["gpt-2"] });
    const end = await runRitual(steps, offered, view, new AbortController().signal);
    expect(end).toBe("completed");
    expect(view.outcomes.get("gpt-2")).toEqual({ kind: "unavailable" });
    expect(view.outcomes.get("gemma-1")?.kind).toBe("recorded");
    expect(view.outcomes.get("gemma-4-e2b")?.kind).toBe("spoken");
  });

  it("lets GPT-2 fail while answering, after some tokens, and continues", async () => {
    const { steps, view } = await setup({ failGenerate: ["gpt-2"], failAfterTokens: 2 });
    const end = await runRitual(steps, offered, view, new AbortController().signal);
    expect(end).toBe("completed");
    expect(view.tokens.get("gpt-2")).toHaveLength(2);
    expect(view.outcomes.get("gpt-2")).toEqual({ kind: "unavailable" });
    expect(view.begun).toContain("medium");
  });

  it("isolates a missing recording like any other failure", async () => {
    const { steps, view } = await setup({}, { recorded: { lookup: () => null } });
    const end = await runRitual(steps, offered, view, new AbortController().signal);
    expect(end).toBe("completed");
    expect(view.outcomes.get("gemma-1")).toEqual({ kind: "unavailable" });
    expect(view.outcomes.get("gemma-4-e2b")?.kind).toBe("spoken");
  });

  it("ends the ritual without the medium when Gemma 4 fails to load", async () => {
    const { steps, view } = await setup({ failLoad: ["gemma-4-e2b"] });
    const end = await runRitual(steps, offered, view, new AbortController().signal);
    expect(end).toBe("ended-early");
    expect(view.outcomes.get("gemma-4-e2b")).toEqual({ kind: "unavailable" });
    expect(view.begun).not.toContain("medium");
  });

  it("ends the ritual without the medium when Gemma 4 fails while answering", async () => {
    const { steps, view } = await setup({ failGenerate: ["gemma-4-e2b"] });
    const end = await runRitual(steps, offered, view, new AbortController().signal);
    expect(end).toBe("ended-early");
    expect(view.begun).not.toContain("medium");
  });
});

describe("cancellation", () => {
  it("stops mid-answer, cancels the worker request and starts no further step", async () => {
    const { steps, view, posted } = await setup({ tokenDelayMs: 1 });
    const controller = new AbortController();
    view.onToken = () => {
      if ((view.tokens.get("gpt-2")?.length ?? 0) === 2) controller.abort();
    };
    const end = await runRitual(steps, offered, view, controller.signal);
    expect(end).toBe("stopped");
    expect(view.begun).toEqual(["gpt-2"]);
    expect(view.outcomes.has("gpt-2")).toBe(false);
    expect(posted.filter((m) => m.type === "cancel")).toHaveLength(1);
    expect(view.events.at(-1)).toBe("finish:stopped");
  });

  it("shows no further tokens after the stop", async () => {
    const { steps, view } = await setup({ tokenDelayMs: 1 });
    const controller = new AbortController();
    view.onToken = () => {
      controller.abort();
    };
    await runRitual(steps, offered, view, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.tokens.get("gpt-2")).toHaveLength(1);
  });

  it("does nothing when aborted before the first step", async () => {
    const { steps, view, posted } = await setup();
    const controller = new AbortController();
    controller.abort();
    const end = await runRitual(steps, offered, view, controller.signal);
    expect(end).toBe("stopped");
    expect(view.begun).toEqual([]);
    expect(posted).toEqual([]);
  });
});

describe("one ritual at a time (AC-002.4)", () => {
  it("refuses a second start while one runs, then accepts one after it ends", async () => {
    const { steps, view } = await setup({ tokenDelayMs: 1 });
    const runner = new RitualRunner(steps, view);
    const first = runner.start(offered);
    expect(first).not.toBeNull();
    expect(runner.running).toBe(true);
    expect(runner.start(own)).toBeNull();
    runner.stop();
    expect(await first).toBe("stopped");
    expect(runner.running).toBe(false);
    const second = runner.start(own);
    expect(second).not.toBeNull();
    runner.stop();
    await second;
  });
});

describe("Stop during a load", () => {
  it("cancels the in-flight load and starts no generation", async () => {
    const { steps, view, posted } = await setup({ loadDelayMs: 50 });
    const controller = new AbortController();
    const running = runRitual(steps, offered, view, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    expect(await running).toBe("stopped");
    expect(posted.map((m) => m.type)).toEqual(["load", "cancel-load"]);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(posted.map((m) => m.type)).toEqual(["load", "cancel-load"]);
    expect(view.tokens.size).toBe(0);
  });

  it("answers ready again when a loaded model is loaded a second time", async () => {
    const worker = createFakeWorker();
    const seen: string[] = [];
    worker.subscribe((m) => seen.push(m.type));
    worker.post({ type: "load", modelId: "gpt-2" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    worker.post({ type: "load", modelId: "gpt-2" });
    expect(seen.filter((t) => t === "ready")).toHaveLength(2);
  });
});

describe("what the steps are given and keep", () => {
  it("passes the completed steps, in order, to each step (for the medium)", async () => {
    const { steps, view } = await setup({ failLoad: ["gpt-2"] }, { includeMedium: false });
    const seen: string[][] = [];
    const probe: RitualStep = {
      info: { id: "probe", name: "Probe", ancestorId: null, mode: "medium" },
      endsRitualOnFailure: false,
      run: (context) => {
        seen.push(context.previous.map((p) => `${p.info.id}:${p.outcome.kind}`));
        return Promise.resolve({ kind: "spoken", text: "" });
      },
    };
    await runRitual([...steps, probe], offered, view, new AbortController().signal);
    expect(seen[0]).toEqual([
      "gpt-2:unavailable",
      "gemma-1:recorded",
      "gemma-2:recorded",
      "gemma-3:recorded",
      "gemma-4-e2b:spoken",
    ]);
  });

  it("keeps an answer that completed just before Stop", async () => {
    const view = new RecordingView();
    const controller = new AbortController();
    const step: RitualStep = {
      info: { id: "late", name: "Late", ancestorId: null, mode: "live" },
      endsRitualOnFailure: false,
      run: () => {
        controller.abort();
        return Promise.resolve({ kind: "spoken", text: "finished in time" });
      },
    };
    const end = await runRitual([step], offered, view, controller.signal);
    expect(end).toBe("stopped");
    expect(view.outcomes.get("late")).toEqual({ kind: "spoken", text: "finished in time" });
  });

  it("is a WorkerVoiceStep that rejects with an abort error on Stop", async () => {
    const step = new WorkerVoiceStep(
      { id: "gpt-2", name: "GPT-2", ancestorId: "gpt-2", mode: "live" },
      {
        modelId: "gpt-2",
        worker: createFakeWorker({ loadDelayMs: 20 }),
        settings: null,
        endsRitualOnFailure: false,
      },
    );
    const controller = new AbortController();
    const result = step.run({
      question: offered,
      previous: [],
      signal: controller.signal,
      emitToken: () => undefined,
      reportProgress: () => undefined,
      askConsent: () => Promise.resolve(true),
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});
