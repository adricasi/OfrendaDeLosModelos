// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { startAltar } from "../src/app.js";
import { createFakeWorker } from "../src/fake/fake-worker.js";
import type { RitualDependencies } from "../src/ritual/plan.js";
import { UNFILTERED_LABEL } from "../src/ritual/plan.js";
import { formatProbability } from "../src/ui/ritual-view.js";
import { loadTestData, mountPage, settle } from "./helpers.js";

function deps(): RitualDependencies {
  return {
    worker: createFakeWorker({
      alternativesFor: ["gpt-2"],
      wordsFor: (id) => (id === "gpt-2" ? ["The", " <b>moon</b>", "\n", " rises."] : ["fine"]),
    }),
    recorded: { lookup: () => ({ text: "recorded", credit: "credit" }) },
    includeMedium: false,
  };
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

function gpt2(): HTMLElement {
  const voice = document.querySelector<HTMLElement>('.voice[data-step-id="gpt-2"]');
  if (voice === null) throw new Error("no GPT-2 voice");
  return voice;
}

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("ghost words on the page (AC-004.1, AC-004.2)", () => {
  beforeEach(async () => {
    mountPage();
    startAltar(document, await loadTestData(), deps());
    submitOffered("remember");
    await untilIdle();
  });

  it("labels GPT-2's answer as coming from an unfiltered 2019 model (AC-003.4)", () => {
    expect(gpt2().querySelector(".voice-caveat")?.textContent).toBe(UNFILTERED_LABEL);
    expect(UNFILTERED_LABEL).toBe("Unfiltered 2019 model");
    expect(document.querySelectorAll(".voice-caveat")).toHaveLength(1);
  });

  it("shows up to three alternatives under each token, with the probability beside each", () => {
    const first = gpt2().querySelector(".token");
    const ghosts = [...(first?.querySelectorAll(".ghost") ?? [])];
    expect(ghosts.map((g) => g.querySelector(".ghost-word")?.textContent)).toEqual([
      "maybe0",
      "perhaps0",
      "almost0",
    ]);
    expect(ghosts.map((g) => g.querySelector(".ghost-p")?.textContent)).toEqual([
      "20%",
      "10%",
      "5.0%",
    ]);
  });

  it("keeps the visible ghost words out of the accessibility tree", () => {
    for (const ghosts of gpt2().querySelectorAll(".ghosts")) {
      expect(ghosts.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("gives screen readers 'almost: X, Y, Z' as each word's description, outside any live region", () => {
    const notes = gpt2().querySelector<HTMLElement>(".ghost-notes");
    expect(notes).not.toBeNull();
    // Hidden from the reading order: referenced by aria-describedby only, so nothing floods.
    expect(notes?.hidden).toBe(true);
    expect(notes?.closest("[aria-live], [role='status'], [role='alert']")).toBeNull();
    expect(
      gpt2()
        .querySelector(".voice-text")
        ?.contains(notes ?? null),
    ).toBe(false);
    const first = notes?.querySelector("p");
    expect(first?.textContent).toBe("The: almost: maybe0, perhaps0, almost0");
    const token = gpt2().querySelector(".token");
    const describedBy = token?.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)).toBe(first);
    expect(notes?.querySelectorAll("p").length).toBe(gpt2().querySelectorAll(".token").length);
  });

  it("adds one summary line per answer for screen readers, not one per word", () => {
    const summaries = gpt2().querySelectorAll(".ghost-summary");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.classList.contains("visually-hidden")).toBe(true);
    expect(summaries[0]?.textContent).toMatch(/arrow keys/);
    expect(gpt2().querySelectorAll("li")).toHaveLength(0);
  });

  it("Escape dismisses the probabilities of the focused word, and leaving it restores them", () => {
    const token = gpt2().querySelector<HTMLElement>(".token");
    if (token === null) throw new Error("no token");
    token.focus();
    press(token, "Escape");
    expect(token.dataset["dismissed"]).toBe("");
    expect(document.activeElement).toBe(token);
    token.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(token.dataset["dismissed"]).toBeUndefined();
  });

  it("a tap or click focuses the word, so the probabilities show without a keyboard", () => {
    const tokens = [...gpt2().querySelectorAll<HTMLElement>(".token")];
    tokens[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.activeElement).toBe(tokens[1]);
  });

  it("renders model text as text, never as HTML", () => {
    expect(gpt2().querySelector(".voice-text b")).toBeNull();
    const words = [...gpt2().querySelectorAll(".token-text")].map((t) => t.textContent);
    expect(words).toContain("<b>moon</b>");
  });

  it("keeps spaces and line breaks of the answer between the tokens", () => {
    const text = gpt2().querySelector(".voice-text");
    const plain = [...(text?.childNodes ?? [])]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("|");
    expect(plain).toContain(" ");
    expect(plain).toContain("\n");
  });

  it("is one tab stop, moved with the arrow keys; focus shows the probabilities", () => {
    const tokens = [...gpt2().querySelectorAll<HTMLElement>(".token")];
    expect(tokens.length).toBeGreaterThan(2);
    expect(tokens.filter((t) => t.tabIndex === 0)).toEqual([tokens[0]]);

    tokens[0]?.focus();
    press(tokens[0] as HTMLElement, "ArrowRight");
    expect(document.activeElement).toBe(tokens[1]);
    expect(tokens[1]?.tabIndex).toBe(0);
    expect(tokens[0]?.tabIndex).toBe(-1);

    press(tokens[1] as HTMLElement, "End");
    expect(document.activeElement).toBe(tokens.at(-1));
    press(tokens.at(-1) as HTMLElement, "Home");
    expect(document.activeElement).toBe(tokens[0]);
    press(tokens[0] as HTMLElement, "ArrowLeft");
    expect(document.activeElement).toBe(tokens[0]);
  });

  it("announces the finished answer once, as plain words (NFR-009)", () => {
    const announced = [...document.querySelectorAll("#ritual-announcer p")].map(
      (p) => p.textContent,
    );
    expect(announced.filter((t) => t?.startsWith("GPT-2:"))).toEqual([
      "GPT-2: The <b>moon</b>\n rises.",
    ]);
  });
});

describe("probability text", () => {
  it.each([
    [0.2, "20%"],
    [0.05, "5.0%"],
    [0.123, "12%"],
    [0.0042, "0.4%"],
    [0.0001, "<0.1%"],
    [1, "100%"],
  ])("formats %s as %s", (p, text) => {
    expect(formatProbability(p)).toBe(text);
  });
});
