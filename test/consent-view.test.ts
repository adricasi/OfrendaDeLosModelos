// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { parseAncestors } from "../src/data/validate.js";
import {
  applyModelOverrides,
  overrideParameter,
  parseModelOverride,
} from "../src/dev/model-override.js";
import type { StepInfo } from "../src/ritual/types.js";
import { consentMessage, createRitualView, formatDownloadSize } from "../src/ui/ritual-view.js";
import { createInferenceHost, type ModelRuntime } from "../src/worker/inference-host.js";
import type { WorkerToUiMessage } from "../src/worker/protocol.js";
import { loadTestData, mountPage, read, settle } from "./helpers.js";

const gemma: StepInfo = {
  id: "gemma-4-e2b",
  name: "Gemma 4 E2B",
  ancestorId: "gemma-4-e2b",
  mode: "live",
};

describe("the download question (AC-006.2)", () => {
  it("states the size in GB or MB, the same way as the progress line", () => {
    expect(formatDownloadSize(1_900_000_000)).toBe("1.9 GB");
    expect(formatDownloadSize(480_000_000)).toBe("480 MB");
    expect(consentMessage({ modelName: "Gemma 4 E2B", bytes: 1_900_000_000 })).toContain(
      "download of about 1.9 GB",
    );
  });

  it("shows two buttons and resolves with the visitor's choice", async () => {
    for (const [label, expected] of [
      ["Download and continue", true],
      ["Not now", false],
    ] as const) {
      mountPage();
      const view = createRitualView(document);
      view.ritualStarted({ text: "q", offeredId: null, lang: "en" });
      view.stepStarted(gemma);
      const answer = view.askConsent?.(
        gemma.id,
        { modelName: "Gemma 4 E2B", bytes: 1_900_000_000 },
        new AbortController().signal,
      );
      const group = document.querySelector('.consent[role="group"]');
      expect(group?.textContent).toContain("about 1.9 GB");
      // Focus goes to the group (named by the question), never to the Download button.
      expect(document.activeElement).toBe(group);
      expect(group?.getAttribute("tabindex")).toBe("-1");
      expect(group?.getAttribute("aria-labelledby")).toBe(
        document.querySelector(".consent-text")?.id,
      );
      expect(document.getElementById("ritual-announcer")?.textContent).not.toContain("download");
      const stop = document.getElementById("stop-button");
      if (stop !== null) stop.hidden = false;
      const button = [...document.querySelectorAll<HTMLButtonElement>(".consent button")].find(
        (b) => b.textContent === label,
      );
      button?.click();
      expect(await answer).toBe(expected);
      expect(document.querySelector(".consent")).toBeNull();
      // Focus is not lost to <body> once the question closes.
      expect(document.activeElement).toBe(document.getElementById("stop-button"));
    }
  });

  it("is removed when the ritual is stopped", async () => {
    mountPage();
    const view = createRitualView(document);
    view.ritualStarted({ text: "q", offeredId: null, lang: "en" });
    view.stepStarted(gemma);
    const controller = new AbortController();
    const answer = view.askConsent?.(
      gemma.id,
      { modelName: "Gemma 4 E2B", bytes: 1_900_000_000 },
      controller.signal,
    );
    controller.abort();
    await expect(answer).rejects.toMatchObject({ name: "AbortError" });
    expect(document.querySelector(".consent")).toBeNull();
  });

  it("relabels a step that was to speak live as a recorded voice once it is recorded", async () => {
    mountPage();
    const view = createRitualView(document);
    view.ritualStarted({ text: "q", offeredId: "remember", lang: "en" });
    view.stepStarted(gemma);
    expect(document.querySelector(".voice-label")?.textContent).toBe(
      "Speaking live, on your device",
    );
    view.stepFinished(gemma, { kind: "recorded", text: "from the tape", credit: "Recorded 2026" });
    await settle();
    expect(document.querySelector(".voice-label")?.textContent).toBe("Recorded voice");
    expect(document.querySelector(".voice-text")?.textContent).toBe("from the tape");
  });

  it("renders recorded medium notes per ancestor, labelled as recorded (AC-007.5)", () => {
    mountPage();
    const view = createRitualView(document);
    const medium: StepInfo = {
      id: "medium",
      name: "La que cuida el altar",
      ancestorId: null,
      mode: "recorded",
    };
    view.ritualStarted({ text: "q", offeredId: "remember", lang: "en" });
    view.stepStarted({ ...gemma, mode: "recorded" });
    view.stepStarted(medium);
    view.stepFinished(medium, {
      kind: "recorded",
      text: "[]",
      credit: "Recorded 2026-10-30",
      notes: [
        { ancestorId: "gemma-4-e2b", meaning: "It spoke.", calaverita: ["a", "b", "c", "d"] },
      ],
    });
    const note = document.querySelector(".medium-note");
    expect(note?.querySelector("h4")?.textContent).toBe("Gemma 4 E2B");
    expect(note?.querySelector(".medium-calaverita")?.textContent).toBe("a\nb\nc\nd");
    expect(document.querySelector('[data-step-id="medium"] .voice-label')?.textContent).toBe(
      "Recorded voice",
    );
    expect(document.querySelector('[data-step-id="medium"] .voice-status')?.textContent).toBe(
      "Recorded 2026-10-30",
    );
  });

  it("uses the outcome's own message for a not-invited step", () => {
    mountPage();
    const view = createRitualView(document);
    view.ritualStarted({ text: "q", offeredId: null, lang: "en" });
    view.stepStarted(gemma);
    view.stepFinished(gemma, { kind: "not-invited", message: "Waiting to be invited." });
    expect(document.querySelector(".voice-status")?.textContent).toBe("Waiting to be invited.");
  });

  it("shows a status line for a step, such as the medium writing", () => {
    mountPage();
    const view = createRitualView(document);
    view.ritualStarted({ text: "q", offeredId: null, lang: "en" });
    view.stepStarted(gemma);
    view.stepStatus?.(gemma.id, "Writing for each model…");
    expect(document.querySelector(".voice-status")?.textContent).toBe("Writing for each model…");
  });
});

describe("the worker's probe (AC-006.2, AC-003.3)", () => {
  function host(runtime: Partial<ModelRuntime>) {
    const sent: WorkerToUiMessage[] = [];
    const h = createInferenceHost({
      runtime: {
        supports: () => true,
        load: () => Promise.reject(new Error("no load")),
        ...runtime,
      },
      send: (m) => sent.push(m),
    });
    return { h, sent };
  }
  const source = { repositoryId: "o/m", revision: "b".repeat(40), dtypes: null };

  it("reports whether the model is stored, without loading it", async () => {
    const { h, sent } = host({ isCached: () => Promise.resolve(true) });
    h.handle({ type: "probe", modelId: "gemma-4-e2b", source });
    await settle(2);
    expect(sent).toEqual([{ type: "probed", modelId: "gemma-4-e2b", cached: true }]);
  });

  it("treats a failing or missing cache check as not stored", async () => {
    const failing = host({ isCached: () => Promise.reject(new Error("x")) });
    failing.h.handle({ type: "probe", modelId: "m", source });
    const missing = host({});
    missing.h.handle({ type: "probe", modelId: "m", source });
    await settle(2);
    expect(failing.sent).toEqual([{ type: "probed", modelId: "m", cached: false }]);
    expect(missing.sent).toEqual([{ type: "probed", modelId: "m", cached: false }]);
  });

  it("refuses a model without a pinned revision", async () => {
    const { h, sent } = host({ isCached: () => Promise.resolve(true) });
    h.handle({ type: "probe", modelId: "m", source: { ...source, revision: "main" } });
    h.handle({ type: "probe", modelId: "n", source: { ...source, revision: null } });
    await settle(2);
    expect(sent[0]).toMatchObject({ type: "probed", cached: false });
    expect(sent[0] !== undefined && "refused" in sent[0]).toBe(true);
    expect(sent[1]).toMatchObject({ type: "probed", modelId: "n", cached: false });
  });
});

describe("Gemma 4 data and the development override", () => {
  const SHA = "0123456789abcdef0123456789abcdef01234567";

  it("keeps Gemma 4 unpinned until T-001 with a per-session dtype map", async () => {
    const data = await loadTestData();
    const g = data.ancestors.find((a) => a.id === "gemma-4-e2b");
    expect(g).toMatchObject({
      repositoryId: null,
      revision: null,
      verify: "T-001",
      downloadBytes: null,
    });
    expect(g?.dtypes?.webgpu).toEqual({ embed_tokens: "q4", decoder_model_merged: "q4" });
  });

  it("validates downloadBytes and dtype maps", () => {
    const base = JSON.parse(read("public/data/ancestors.json")) as {
      ancestors: Record<string, unknown>[];
    };
    const withPatch = (patch: Record<string, unknown>): unknown => ({
      ancestors: [{ ...base.ancestors[0], ...patch }],
    });
    expect(parseAncestors(withPatch({ downloadBytes: 1_900_000_000 }))[0]?.downloadBytes).toBe(
      1_900_000_000,
    );
    expect(() => parseAncestors(withPatch({ downloadBytes: -1 }))).toThrow();
    expect(() => parseAncestors(withPatch({ dtypes: { webgpu: { embed_tokens: 3 } } }))).toThrow();
    expect(() => parseAncestors(withPatch({ dtypes: { webgpu: 5 } }))).toThrow();
  });

  it("names the parameter model-gemma4 and parses id@sha like GPT-2's", () => {
    expect(overrideParameter("gemma-4-e2b")).toBe("model-gemma4");
    expect(
      parseModelOverride(`?model-gemma4=onnx-community/gemma-4-E2B-it-ONNX@${SHA}`, "gemma-4-e2b"),
    ).toEqual({
      repositoryId: "onnx-community/gemma-4-E2B-it-ONNX",
      revision: SHA,
    });
    expect(parseModelOverride("?model-gemma4=o/m@main", "gemma-4-e2b")).toBeNull();
  });

  it("applies to Gemma 4 only", async () => {
    const data = await loadTestData();
    const result = applyModelOverrides(data.ancestors, `?model-gemma4=o/m@${SHA}`);
    expect(result.filter((a) => a.revision !== null).map((a) => a.id)).toEqual(["gemma-4-e2b"]);
  });
});
