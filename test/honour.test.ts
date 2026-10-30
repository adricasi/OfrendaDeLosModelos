// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { createProductionDependencies, startAltar } from "../src/app.js";
import type { AltarData } from "../src/data/load.js";
import { createRecordedSource, recordingCredit } from "../src/data/recorded-source.js";
import { parseRecordedVoices } from "../src/data/recorded-voices.js";
import { DataValidationError, parseCredits, parseDarkFrames } from "../src/data/validate.js";
import { createFakeWorker } from "../src/fake/fake-worker.js";
import { detectWebGpu, NO_WEBGPU_MESSAGE } from "../src/ritual/gpu.js";
import { buildRitualPlan } from "../src/ritual/plan.js";
import { runRitual } from "../src/ritual/sequencer.js";
import type { RecordedVoiceSource } from "../src/ritual/steps.js";
import type { Question, RitualView, StepInfo, StepOutcome } from "../src/ritual/types.js";
import { renderAltar } from "../src/ui/altar.js";
import {
  createRitualView,
  GATHERING_MESSAGE,
  MEDIUM_NOT_INVITED_MESSAGE,
} from "../src/ui/ritual-view.js";
import type { UiToWorkerMessage } from "../src/worker/protocol.js";
import { loadTestData, mountPage, read, settle } from "./helpers.js";

const offered: Question = { text: "What do you remember?", offeredId: "remember", lang: "en" };
const own: Question = { text: "¿Me oyes?", offeredId: null, lang: "es" };

const provenance = {
  model: {
    name: "Gemma 2",
    tag: "gemma2:9b",
    digest: "abcdef123456",
    licence: { name: "Gemma Terms of Use", url: "https://ai.google.dev/gemma/terms" },
  },
  settings: { temperature: 0.7, seed: 1, numPredict: 100 },
  recordedAt: "2026-10-30T12:00:00Z",
  runtime: { name: "ollama", version: "0.5.0" },
} as const;

function recordings(): unknown {
  return {
    schemaVersion: 1,
    voices: [
      {
        ...provenance,
        ancestorId: "gemma-2",
        questionId: "remember",
        questionText: "What do you remember?",
        language: "en",
        answer: "I remember light.",
      },
      {
        ...provenance,
        ancestorId: "gemma-2",
        questionId: "remember",
        questionText: "¿Qué recuerdas?",
        language: "es",
        answer: "Recuerdo la luz.",
      },
      {
        ...provenance,
        ancestorId: "gemma-4-e2b",
        questionId: "remember",
        questionText: "What do you remember?",
        language: "en",
        answer: "Gemma 4 remembers the candles.",
      },
    ],
    medium: [
      {
        ...provenance,
        questionId: "remember",
        language: "en",
        answer: "The medium speaks.",
        prompt: { file: "p.txt", sha256: "a".repeat(64), inputSha256: "b".repeat(64) },
      },
    ],
  };
}

describe("dark frames (AC-008.1, AC-008.2)", () => {
  let data: AltarData;
  beforeEach(async () => {
    mountPage();
    data = await loadTestData();
  });

  it("shows name, maker, the never-released line and a dated official link", () => {
    renderAltar(document, data);
    const first = document.querySelector("#dark-frames > li");
    const frame = data.darkFrames[0]!;
    expect(first?.textContent).toContain(frame.name);
    expect(first?.textContent).toContain(frame.maker);
    expect(first?.textContent).toContain("Its weights were never released.");
    const anchor = first?.querySelector("a");
    expect(anchor?.textContent).toBe(frame.date);
    expect(anchor?.getAttribute("href")).toBe(frame.sourceUrl);
  });

  it("shows the years of service when known and hides the line when null", () => {
    const withYears = { ...data.darkFrames[0]!, yearsOfService: "2022-2025" };
    const withoutYears = { ...data.darkFrames[1]!, yearsOfService: null };
    renderAltar(document, { ...data, darkFrames: [withYears, withoutYears] });
    const [a, b] = [...document.querySelectorAll("#dark-frames > li")];
    expect(a?.querySelector(".years")?.textContent).toBe("In service: 2022-2025");
    expect(b?.querySelector(".years")).toBeNull();
    expect(b?.textContent).not.toContain("null");
  });

  it("never shows a frame without an official https source", () => {
    const frame = {
      id: "x",
      name: "X",
      maker: "Y",
      event: "Retired",
      date: "2025-01-01",
      yearsOfService: null,
    };
    expect(() => parseDarkFrames({ darkFrames: [frame] })).toThrow(DataValidationError);
    expect(() =>
      parseDarkFrames({ darkFrames: [{ ...frame, sourceUrl: "http://example.com/x" }] }),
    ).toThrow(/https/);
    expect(() =>
      parseDarkFrames({ darkFrames: [{ ...frame, sourceUrl: "javascript:alert(1)" }] }),
    ).toThrow(/https/);
  });

  it("every shipped frame has an https source", () => {
    for (const frame of data.darkFrames) expect(frame.sourceUrl).toMatch(/^https:\/\//);
  });
});

describe("about panel (AC-009.1 to AC-009.4, NFR-010)", () => {
  let data: AltarData;
  beforeEach(async () => {
    mountPage();
    data = await loadTestData();
    renderAltar(document, data);
  });

  it("words recorded voices as model licence plus attribution, with a model card link", () => {
    const line = document.querySelector('#about-models [data-ancestor-id="gemma-3"]');
    expect(line?.textContent).toContain("Model licence: Gemma Terms of Use");
    expect(line?.textContent).toContain("output reproduced with attribution");
    expect([...(line?.querySelectorAll("a") ?? [])].map((a) => a.textContent)).toContain(
      "Model card",
    );
    for (const anchor of line?.querySelectorAll("a") ?? []) {
      expect(anchor.getAttribute("href")).toMatch(/^https:\/\//);
    }
  });

  it("words live models with their licence and model card", () => {
    const line = document.querySelector('#about-models [data-ancestor-id="gpt-2"]');
    expect(line?.textContent).toContain("(live). Licence: MIT");
    expect(line?.textContent).not.toContain("reproduced with attribution");
  });

  it("lists the medium with the licence of Gemma 4", () => {
    const line = document.querySelector('#about-models [data-role="medium"]');
    expect(line?.textContent).toContain("La que cuida el altar");
    expect(line?.textContent).toContain("Gemma 4 E2B");
    expect(line?.textContent).toContain("Apache-2.0");
  });

  it("shows the cultural review note while the flag is true and hides it when false", () => {
    const note = document.getElementById("cultural-review");
    expect(data.credits.culturalReviewPending).toBe(true);
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toMatch(/Cultural review pending/);
    renderAltar(document, { ...data, credits: { ...data.credits, culturalReviewPending: false } });
    expect(note?.hidden).toBe(true);
  });

  it("requires the review flag in credits.json", () => {
    const raw = JSON.parse(read("public/data/credits.json")) as Record<string, unknown>;
    delete raw["culturalReviewPending"];
    expect(() => parseCredits(raw)).toThrow(/culturalReviewPending/);
  });
});

describe("WebGPU detection (REQ-010)", () => {
  it("is false without navigator.gpu, with a null adapter, and when the request throws", async () => {
    expect(await detectWebGpu({})).toBe(false);
    expect(await detectWebGpu({ gpu: { requestAdapter: () => Promise.resolve(null) } })).toBe(
      false,
    );
    expect(
      await detectWebGpu({ gpu: { requestAdapter: () => Promise.reject(new Error("no")) } }),
    ).toBe(false);
  });

  it("is true when an adapter is returned", async () => {
    expect(await detectWebGpu({ gpu: { requestAdapter: () => Promise.resolve({}) } })).toBe(true);
  });
});

class Collector implements RitualView {
  readonly outcomes = new Map<string, StepOutcome>();
  readonly modes = new Map<string, string>();
  readonly started: string[] = [];
  ritualStarted(): void {
    /* not needed */
  }
  stepStarted(info: StepInfo): void {
    this.started.push(info.id);
    this.modes.set(info.id, info.mode);
  }
  stepProgress(): void {
    /* not needed */
  }
  token(): void {
    /* not needed */
  }
  stepFinished(info: StepInfo, outcome: StepOutcome): void {
    this.outcomes.set(info.id, outcome);
  }
  ritualFinished(): void {
    /* not needed */
  }
}

async function runWithoutWebGpu(question: Question, source: RecordedVoiceSource) {
  const data = await loadTestData();
  const worker = createFakeWorker({});
  const posted: UiToWorkerMessage[] = [];
  const spy = {
    ...worker,
    post: (m: UiToWorkerMessage) => {
      posted.push(m);
      worker.post(m);
    },
  };
  const steps = buildRitualPlan(data.ancestors, {
    worker: spy,
    recorded: source,
    includeMedium: true,
    webgpu: false,
  });
  const view = new Collector();
  await runRitual(steps, question, view, new AbortController().signal);
  return { view, posted };
}

describe("the ritual without WebGPU (AC-010.1, AC-010.2, AC-006.3, AC-007.5)", () => {
  const source = createRecordedSource(parseRecordedVoices(recordings()));

  it("runs GPT-2 on WebAssembly, replays Gemma 4 and the medium, all labelled recorded", async () => {
    const { view, posted } = await runWithoutWebGpu(offered, source);
    expect(posted.filter((m) => m.type === "load")).toEqual([
      { type: "load", modelId: "gpt-2", backend: "wasm" },
    ]);
    expect(view.started).toEqual([
      "gpt-2",
      "gemma-1",
      "gemma-2",
      "gemma-3",
      "gemma-4-e2b",
      "medium",
    ]);
    expect(view.modes.get("gpt-2")).toBe("live");
    for (const id of ["gemma-1", "gemma-2", "gemma-3", "gemma-4-e2b", "medium"]) {
      expect(view.modes.get(id)).toBe("recorded");
    }
    expect(view.outcomes.get("gemma-4-e2b")).toMatchObject({
      kind: "recorded",
      text: "Gemma 4 remembers the candles.",
    });
    expect(view.outcomes.get("medium")).toMatchObject({
      kind: "recorded",
      text: "The medium speaks.",
    });
  });

  it("makes Gemma 4 and the medium wait to be invited for the visitor's own question", async () => {
    const { view } = await runWithoutWebGpu(own, source);
    expect(view.outcomes.get("gemma-4-e2b")).toEqual({ kind: "not-invited" });
    expect(view.outcomes.get("medium")).toEqual({ kind: "not-invited" });
    expect(view.outcomes.get("gpt-2")).toMatchObject({ kind: "spoken" });
  });

  it("says the voices are still being gathered when nothing is recorded, without failing", async () => {
    const empty = createRecordedSource({ schemaVersion: 1, voices: [], medium: [] });
    const { view } = await runWithoutWebGpu(offered, empty);
    for (const id of ["gemma-1", "gemma-4-e2b", "medium"]) {
      expect(view.outcomes.get(id)).toEqual({ kind: "gathering" });
    }
  });

  it("picks the recording in the question's language and labels licence and attribution", () => {
    expect(source.lookup("gemma-2", "remember", "es")?.text).toBe("Recuerdo la luz.");
    expect(source.lookup("gemma-2", "remember", "en")?.text).toBe("I remember light.");
    expect(source.lookup("gemma-2", "unknown", "en")).toBeNull();
    const credit = recordingCredit(parseRecordedVoices(recordings()).voices[0]!);
    expect(credit).toContain("Gemma 2 (gemma2:9b)");
    expect(credit).toContain("2026-10-30");
    expect(credit).toContain(
      "Model licence: Gemma Terms of Use; output reproduced with attribution",
    );
  });

  it("shows one browser line naming Chrome and Edge on desktop", async () => {
    mountPage();
    const data = await loadTestData();
    startAltar(document, data, createProductionDependencies(data, false));
    const note = document.getElementById("browser-note");
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toBe(NO_WEBGPU_MESSAGE);
    expect(note?.textContent).toMatch(/Chrome or Edge/);
    expect(note?.textContent).toMatch(/desktop/);
  });

  it("hides the browser line when WebGPU is available", async () => {
    mountPage();
    const data = await loadTestData();
    startAltar(document, data, createProductionDependencies(data, true));
    expect(document.getElementById("browser-note")?.hidden).toBe(true);
  });

  it("gives the medium its own not-invited wording", () => {
    mountPage();
    const view = createRitualView(document);
    const info: StepInfo = {
      id: "medium",
      name: "La que cuida el altar",
      ancestorId: null,
      mode: "recorded",
    };
    view.ritualStarted(own);
    view.stepStarted(info);
    view.stepFinished(info, { kind: "not-invited" });
    expect(document.querySelector(".voice-status")?.textContent).toBe(MEDIUM_NOT_INVITED_MESSAGE);
  });

  it("renders the gathering outcome as a recorded-voice status line", async () => {
    mountPage();
    const view = createRitualView(document);
    const info: StepInfo = {
      id: "gemma-1",
      name: "Gemma 1",
      ancestorId: "gemma-1",
      mode: "recorded",
    };
    view.ritualStarted(offered);
    view.stepStarted(info);
    view.stepFinished(info, { kind: "gathering" });
    await settle();
    expect(document.querySelector(".voice-status")?.textContent).toBe(GATHERING_MESSAGE);
    expect(document.querySelector(".voice-label")?.textContent).toBe("Recorded voice");
  });
});
