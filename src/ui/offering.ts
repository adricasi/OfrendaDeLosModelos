import type { OfferedQuestion } from "../data/validate.js";
import {
  OFFERING_ERROR_MESSAGES,
  offeredQuestion,
  validateOwnQuestion,
} from "../ritual/offering.js";
import type { Question } from "../ritual/types.js";

export interface OfferingHandlers {
  onOffer(question: Question): void;
  onStop(): void;
}

export interface OfferingForm {
  /** While a ritual runs the form accepts no offering and the Stop control is shown (AC-002.4). */
  setRunning(running: boolean): void;
}

function byId<T extends HTMLElement>(doc: Document, id: string, type: new () => T): T {
  const element = doc.getElementById(id);
  if (!(element instanceof type)) throw new Error(`index.html is missing #${id}`);
  return element;
}

function setError(box: HTMLElement, message: string | null): void {
  box.hidden = message === null;
  box.textContent = message ?? "";
}

/** Wires the offering form in index.html; the question text is never stored or sent. */
export function wireOffering(
  doc: Document,
  questions: readonly OfferedQuestion[],
  handlers: OfferingHandlers,
): OfferingForm {
  const form = byId(doc, "offering-form", HTMLFormElement);
  const fields = byId(doc, "offering-fields", HTMLFieldSetElement);
  const offered = byId(doc, "offered-questions", HTMLDivElement);
  const ownChoice = byId(doc, "own-choice", HTMLInputElement);
  const ownText = byId(doc, "own-question", HTMLTextAreaElement);
  const ownError = byId(doc, "own-error", HTMLParagraphElement);
  const choiceError = byId(doc, "choice-error", HTMLParagraphElement);
  const offerButton = byId(doc, "offer-button", HTMLButtonElement);
  const stopButton = byId(doc, "stop-button", HTMLButtonElement);
  let running = false;

  const language = (): "en" | "es" => {
    const checked = form.querySelector<HTMLInputElement>('input[name="language"]:checked');
    return checked?.value === "es" ? "es" : "en";
  };
  const selectedOfferedId = (): string | null => {
    const checked = form.querySelector<HTMLInputElement>('input[name="question"]:checked');
    return checked === null || checked === ownChoice ? null : checked.value;
  };
  const clearErrors = (): void => {
    setError(ownError, null);
    setError(choiceError, null);
    ownText.removeAttribute("aria-invalid");
  };

  const renderOffered = (): void => {
    const lang = language();
    const keep = selectedOfferedId();
    offered.replaceChildren(
      ...questions.map((question) => {
        const label = doc.createElement("label");
        label.className = "choice";
        label.lang = lang;
        const radio = doc.createElement("input");
        radio.type = "radio";
        radio.name = "question";
        radio.value = question.id;
        radio.checked = question.id === keep;
        label.append(radio, ` ${question[lang]}`);
        return label;
      }),
    );
  };
  renderOffered();

  for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="language"]')) {
    radio.addEventListener("change", renderOffered);
  }
  form.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === "question") {
      clearErrors();
    }
  });
  ownText.addEventListener("input", () => {
    ownChoice.checked = true;
    clearErrors();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (running) return;
    clearErrors();
    if (ownChoice.checked) {
      const result = validateOwnQuestion(ownText.value);
      if (!result.ok) {
        setError(ownError, OFFERING_ERROR_MESSAGES[result.error]);
        ownText.setAttribute("aria-invalid", "true");
        ownText.focus();
        return;
      }
      handlers.onOffer(result.question);
      return;
    }
    const id = selectedOfferedId();
    const chosen = questions.find((question) => question.id === id);
    if (chosen === undefined) {
      setError(choiceError, "Choose one of the questions, or write your own.");
      offered.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }
    handlers.onOffer(offeredQuestion(chosen, language()));
  });
  stopButton.addEventListener("click", () => {
    handlers.onStop();
  });

  return {
    setRunning(value: boolean): void {
      running = value;
      fields.disabled = value;
      offerButton.disabled = value;
      stopButton.hidden = !value;
      if (value) stopButton.focus();
      else offerButton.focus();
    },
  };
}
