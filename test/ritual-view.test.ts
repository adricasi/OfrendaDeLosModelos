// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { startAltar } from "../src/app.js";
import { createFakeWorker } from "../src/fake/fake-worker.js";
import type { RitualDependencies } from "../src/ritual/plan.js";
import {
  NOT_INVITED_MESSAGE,
  UNAVAILABLE_MESSAGE,
  createRitualView,
} from "../src/ui/ritual-view.js";
import { loadTestData, mountPage, settle } from "./helpers.js";

const recorded = { lookup: () => ({ text: "<b>recorded</b>", credit: "credit line" }) };

function deps(overrides: Partial<RitualDependencies> = {}): RitualDependencies {
  return {
    worker: createFakeWorker({
      wordsFor: (id) => (id === "gpt-2" ? ["<img src=x onerror=alert(1)>", " ok"] : ["fine"]),
    }),
    recorded,
    includeMedium: true,
    ...overrides,
  };
}

function click(id: string): void {
  document.getElementById(id)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function submitOffered(id: string): void {
  const radio = document.querySelector<HTMLInputElement>(`input[name="question"][value="${id}"]`);
  if (radio === null) throw new Error("no radio");
  radio.checked = true;
  document
    .getElementById("offering-form")
    ?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

async function untilIdle(): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    await settle();
    if (document.getElementById("stop-button")?.hidden === true) return;
  }
  throw new Error("ritual did not finish");
}

describe("the ritual on the page", () => {
  beforeEach(async () => {
    mountPage();
    startAltar(document, await loadTestData(), deps());
  });

  it("renders every voice in order as text, never as HTML (NFR-009, design Security)", async () => {
    submitOffered("remember");
    await untilIdle();
    const names = [...document.querySelectorAll(".voice-name")].map((n) => n.textContent);
    expect(names).toEqual([
      "GPT-2",
      "Gemma 1",
      "Gemma 2",
      "Gemma 3",
      "Gemma 4 E2B",
      "La que cuida el altar",
    ]);
    const voices = document.querySelectorAll(".voice-text");
    expect(voices[0]?.textContent).toBe("<img src=x onerror=alert(1)> ok");
    expect(voices[0]?.querySelector("img")).toBeNull();
    expect(voices[1]?.textContent).toBe("<b>recorded</b>");
    expect(voices[1]?.querySelector("b")).toBeNull();
    expect(document.querySelectorAll(".voice-status")[1]?.textContent).toBe("credit line");
    expect(document.querySelector('.voice-name[lang="es"]')?.textContent).toBe(
      "La que cuida el altar",
    );
    expect(document.getElementById("ritual-end")?.textContent).toMatch(/complete/);
  });

  it("announces each answer once, when it completes, not per token", async () => {
    submitOffered("remember");
    await untilIdle();
    const announcements = [...document.querySelectorAll("#ritual-announcer p")].map(
      (p) => p.textContent,
    );
    expect(announcements.filter((a) => a?.startsWith("GPT-2:"))).toEqual([
      "GPT-2: <img src=x onerror=alert(1)> ok",
    ]);
    // question + 6 voices + the end line
    expect(announcements).toHaveLength(8);
    expect(document.querySelector(".ritual [aria-live], #ritual [role=status]")).toBeNull();
    expect(document.getElementById("ritual-announcer")?.getAttribute("aria-live")).toBe("polite");
  });

  it("lights the speaking ancestor's place and clears it when done", async () => {
    submitOffered("remember");
    await settle();
    expect(document.querySelector(".place.speaking")).not.toBeNull();
    await untilIdle();
    expect(document.querySelector(".place.speaking")).toBeNull();
  });

  it("shows the own-question message in place of recorded voices (AC-005.3)", async () => {
    const own = document.getElementById("own-question");
    if (!(own instanceof HTMLTextAreaElement)) throw new Error("no textarea");
    own.value = "¿Me oyes?";
    own.dispatchEvent(new Event("input", { bubbles: true }));
    document
      .getElementById("offering-form")
      ?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await untilIdle();
    const statuses = [...document.querySelectorAll(".voice")]
      .filter((v) => (v as HTMLElement).dataset["state"] === "not-invited")
      .map((v) => v.querySelector(".voice-status")?.textContent);
    expect(statuses).toEqual([NOT_INVITED_MESSAGE, NOT_INVITED_MESSAGE, NOT_INVITED_MESSAGE]);
  });

  it("stops the ritual from the Stop control and re-enables the form", async () => {
    submitOffered("remember");
    expect(document.getElementById("stop-button")?.hidden).toBe(false);
    click("stop-button");
    await untilIdle();
    expect(document.getElementById("ritual-end")?.textContent).toMatch(/stopped/);
    expect(document.getElementById("offer-button")).toHaveProperty("disabled", false);
  });
});

describe("the medium's notes (T-006 data shape)", () => {
  const notes = [
    {
      ancestorId: "gpt-2",
      meaning: "Quería hablar.",
      calaverita: ["uno", "dos", "tres", "cuatro"],
    },
    { ancestorId: "gemma-1", meaning: "Ya estaba aquí.", calaverita: ["a", "b", "c", "d"] },
  ];
  it("renders one block per ancestor inside the medium's step and announces it once, in Spanish", async () => {
    mountPage();
    await loadTestData();
    const view = createRitualView(document);
    const gpt = { id: "gpt-2", name: "GPT-2", ancestorId: "gpt-2", mode: "live" } as const;
    const gemma = {
      id: "gemma-1",
      name: "Gemma 1",
      ancestorId: "gemma-1",
      mode: "recorded",
    } as const;
    const medium = {
      id: "medium",
      name: "La que cuida el altar",
      nameLang: "es",
      ancestorId: null,
      mode: "medium",
    } as const;
    view.ritualStarted({ text: "¿Qué recuerdas?", offeredId: "remember", lang: "es" });
    view.stepStarted(gpt);
    view.stepFinished(gpt, { kind: "spoken", text: "x" });
    view.stepStarted(gemma);
    view.stepFinished(gemma, { kind: "spoken", text: "y" });
    view.stepStarted(medium);
    view.stepFinished(medium, { kind: "spoken", text: "raw", notes });
    const mediumVoice = document.querySelector('.voice[data-step-id="medium"]');
    const blocks = mediumVoice?.querySelectorAll(".medium-note") ?? [];
    expect([...blocks].map((b) => b.querySelector("h4")?.textContent)).toEqual([
      "GPT-2",
      "Gemma 1",
    ]);
    expect(blocks[0]?.querySelector(".medium-calaverita")?.textContent).toBe(
      "uno\ndos\ntres\ncuatro",
    );
    const announced = [...document.querySelectorAll("#ritual-announcer p")].filter((p) =>
      p.textContent?.startsWith("La que cuida el altar"),
    );
    expect(announced).toHaveLength(1);
    expect(announced[0]?.getAttribute("lang")).toBe("es");
  });
});

describe("focus after the ritual", () => {
  it("does not steal focus the visitor moved elsewhere", async () => {
    mountPage();
    startAltar(document, await loadTestData(), deps());
    submitOffered("remember");
    const link = document.getElementById("about-link");
    link?.focus();
    await untilIdle();
    expect(document.activeElement).toBe(link);
  });
});

describe("a failing ancestor on the page", () => {
  it("says it could not come tonight and carries on (AC-003.3)", async () => {
    mountPage();
    startAltar(
      document,
      await loadTestData(),
      deps({ worker: createFakeWorker({ failLoad: ["gpt-2"] }) }),
    );
    submitOffered("remember");
    await untilIdle();
    const first = document.querySelector(".voice");
    expect(first?.querySelector(".voice-status")?.textContent).toBe(UNAVAILABLE_MESSAGE);
    expect(document.querySelectorAll(".voice")).toHaveLength(6);
  });

  it("ends without the medium when Gemma 4 fails (AC-006.4)", async () => {
    mountPage();
    startAltar(
      document,
      await loadTestData(),
      deps({ worker: createFakeWorker({ failLoad: ["gemma-4-e2b"] }) }),
    );
    submitOffered("remember");
    await untilIdle();
    expect(document.querySelectorAll(".voice")).toHaveLength(5);
    expect(document.getElementById("ritual-end")?.textContent).toMatch(/ended early/);
  });
});
