// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_QUESTION_LENGTH,
  OFFERING_ERROR_MESSAGES,
  validateOwnQuestion,
} from "../src/ritual/offering.js";
import type { Question } from "../src/ritual/types.js";
import { wireOffering, type OfferingForm } from "../src/ui/offering.js";
import { loadTestData, mountPage } from "./helpers.js";

describe("own question validation (AC-002.2, AC-002.3)", () => {
  it("trims and accepts 1 to 280 characters", () => {
    expect(validateOwnQuestion("  Hola?  ")).toEqual({
      ok: true,
      question: { text: "Hola?", offeredId: null, lang: null },
    });
    expect(validateOwnQuestion("a".repeat(MAX_QUESTION_LENGTH)).ok).toBe(true);
  });

  it("rejects empty and whitespace-only questions", () => {
    expect(validateOwnQuestion("")).toEqual({ ok: false, error: "empty" });
    expect(validateOwnQuestion(" \n\t ")).toEqual({ ok: false, error: "empty" });
  });

  it("rejects more than 280 characters, counting characters not UTF-16 units", () => {
    expect(validateOwnQuestion("a".repeat(MAX_QUESTION_LENGTH + 1))).toEqual({
      ok: false,
      error: "too-long",
    });
    expect(validateOwnQuestion("🕯️".repeat(141)).ok).toBe(false);
    expect(validateOwnQuestion("🕯".repeat(MAX_QUESTION_LENGTH)).ok).toBe(true);
  });

  it("counts the length after trimming", () => {
    expect(validateOwnQuestion(` ${"a".repeat(MAX_QUESTION_LENGTH)} `).ok).toBe(true);
  });
});

describe("the offering form", () => {
  let offers: Question[];
  let stops: number;
  let form: OfferingForm;

  const radio = (value: string): HTMLInputElement => {
    const found = document.querySelector<HTMLInputElement>(
      `input[name="question"][value="${value}"]`,
    );
    if (found === null) throw new Error(`no radio ${value}`);
    return found;
  };
  const submit = (): void => {
    document
      .getElementById("offering-form")
      ?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  };
  const own = (): HTMLTextAreaElement => {
    const field = document.getElementById("own-question");
    if (!(field instanceof HTMLTextAreaElement)) throw new Error("no textarea");
    return field;
  };
  const type = (text: string): void => {
    own().value = text;
    own().dispatchEvent(new Event("input", { bubbles: true }));
  };
  const text = (id: string): string => document.getElementById(id)?.textContent ?? "";
  const hidden = (id: string): boolean => document.getElementById(id)?.hidden ?? false;

  beforeEach(async () => {
    mountPage();
    const data = await loadTestData();
    offers = [];
    stops = 0;
    form = wireOffering(document, data.questions, {
      onOffer: (question) => offers.push(question),
      onStop: () => {
        stops += 1;
      },
    });
  });

  it("starts the ritual with the chosen offered question (AC-002.1)", () => {
    radio("remember").checked = true;
    submit();
    expect(offers).toEqual([{ text: "What do you remember?", offeredId: "remember", lang: "en" }]);
  });

  it("offers the Spanish text, marked lang=es, when Spanish is chosen", () => {
    const spanish = document.querySelector<HTMLInputElement>('input[name="language"][value="es"]');
    if (spanish === null) throw new Error("no language radio");
    spanish.checked = true;
    spanish.dispatchEvent(new Event("change", { bubbles: true }));
    const label = radio("remember").closest("label");
    expect(label?.lang).toBe("es");
    expect(label?.textContent).toContain("¿Qué recuerdas?");
    radio("remember").checked = true;
    submit();
    expect(offers[0]).toEqual({ text: "¿Qué recuerdas?", offeredId: "remember", lang: "es" });
  });

  it("starts the ritual with the visitor's own trimmed question (AC-002.2)", () => {
    type("  ¿Me oyes, abuela?  ");
    submit();
    expect(offers).toEqual([{ text: "¿Me oyes, abuela?", offeredId: null, lang: null }]);
  });

  it("says why next to the field and does not start when empty (AC-002.3)", () => {
    radio("own").checked = true;
    submit();
    expect(offers).toHaveLength(0);
    expect(hidden("own-error")).toBe(false);
    expect(text("own-error")).toBe(OFFERING_ERROR_MESSAGES.empty);
    expect(own().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(own());
  });

  it("says why when the question is too long, and keeps the input (AC-002.3)", () => {
    type("x".repeat(MAX_QUESTION_LENGTH + 1));
    submit();
    expect(offers).toHaveLength(0);
    expect(text("own-error")).toBe(OFFERING_ERROR_MESSAGES["too-long"]);
    expect(own().value).toHaveLength(MAX_QUESTION_LENGTH + 1);
  });

  it("clears the error when the visitor edits the field", () => {
    type("");
    submit();
    type("Hola");
    expect(hidden("own-error")).toBe(true);
    expect(own().hasAttribute("aria-invalid")).toBe(false);
  });

  it("asks for a choice when nothing is chosen", () => {
    submit();
    expect(offers).toHaveLength(0);
    expect(hidden("choice-error")).toBe(false);
  });

  it("accepts no other offering while a ritual runs, and shows Stop (AC-002.4)", () => {
    form.setRunning(true);
    const fields = document.getElementById("offering-fields");
    expect(fields instanceof HTMLFieldSetElement && fields.disabled).toBe(true);
    expect(hidden("stop-button")).toBe(false);
    expect(document.activeElement?.id).toBe("stop-button");
    radio("remember").checked = true;
    submit();
    expect(offers).toHaveLength(0);

    document.getElementById("stop-button")?.click();
    expect(stops).toBe(1);

    form.setRunning(false);
    expect(hidden("stop-button")).toBe(true);
    expect(document.activeElement?.id).toBe("offer-button");
    submit();
    expect(offers).toHaveLength(1);
  });

  it("never writes the question to storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    type("private question");
    submit();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
  });
});
