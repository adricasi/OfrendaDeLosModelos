import type {
  Question,
  RitualEnd,
  RitualView,
  StepInfo,
  StepOutcome,
  Token,
} from "../ritual/types.js";

export const UNAVAILABLE_MESSAGE = "This ancestor could not come tonight.";
export const NOT_INVITED_MESSAGE =
  "These ancestors only answer the questions they left for us. Their voices rest tonight.";

const END_MESSAGES: Readonly<Record<RitualEnd, string>> = {
  completed: "The ritual is complete.",
  stopped: "The ritual was stopped.",
  "ended-early": "The ritual ended early: the ancestor who tends the altar could not come.",
};

const MODE_LABELS = {
  live: "Speaking live, on your device",
  recorded: "Recorded voice",
  medium: "Speaking live, on your device",
} as const;

function byId(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (element === null) throw new Error(`index.html is missing #${id}`);
  return element;
}

function make<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

interface VoiceElements {
  readonly item: HTMLLIElement;
  readonly text: Text;
  readonly status: HTMLElement;
}

/**
 * Renders the ritual. Streamed tokens are appended to a Text node (never HTML). Nothing
 * inside the streaming text is a live region: each answer is announced once, when it
 * completes, through the polite status region (NFR-009).
 */
export function createRitualView(doc: Document): RitualView {
  const section = byId(doc, "ritual");
  const questionLine = byId(doc, "ritual-question");
  const list = byId(doc, "ritual-voices");
  const endLine = byId(doc, "ritual-end");
  const announcer = byId(doc, "ritual-announcer");
  const voices = new Map<string, VoiceElements>();

  const announce = (message: string): void => {
    announcer.append(make(doc, "p", "", message));
  };
  const place = (info: StepInfo): HTMLElement | null =>
    info.ancestorId === null
      ? null
      : doc.querySelector<HTMLElement>(`#places [data-ancestor-id="${info.ancestorId}"]`);
  const clearSpeaking = (): void => {
    for (const lit of doc.querySelectorAll(".place.speaking")) lit.classList.remove("speaking");
  };
  const nameOf = (info: StepInfo): string => info.name;

  return {
    ritualStarted(question: Question): void {
      voices.clear();
      list.replaceChildren();
      announcer.replaceChildren();
      endLine.textContent = "";
      questionLine.textContent = question.text;
      if (question.lang === null) questionLine.removeAttribute("lang");
      else questionLine.lang = question.lang;
      section.hidden = false;
      announce(`The ritual begins. Your question: ${question.text}`);
    },

    stepStarted(info: StepInfo): void {
      const item = doc.createElement("li");
      item.className = "voice";
      item.dataset["stepId"] = info.id;
      item.dataset["state"] = "speaking";
      const name = make(doc, "h3", "voice-name", nameOf(info));
      if (info.nameLang !== undefined) name.lang = info.nameLang;
      const label = make(doc, "p", "voice-label", MODE_LABELS[info.mode]);
      const textNode = doc.createTextNode("");
      const text = make(doc, "p", "voice-text");
      text.append(textNode);
      const status = make(doc, "p", "voice-status");
      item.append(name, label, text, status);
      list.append(item);
      voices.set(info.id, { item, text: textNode, status });
      place(info)?.classList.add("speaking");
    },

    stepProgress(stepId: string, loaded: number, total: number): void {
      const voice = voices.get(stepId);
      if (voice === undefined || total <= 0) return;
      voice.status.textContent = `Preparing… ${String(Math.round((loaded / total) * 100))}%`;
    },

    token(stepId: string, token: Token): void {
      const voice = voices.get(stepId);
      if (voice === undefined) return;
      voice.status.textContent = "";
      voice.text.appendData(token.text);
    },

    stepFinished(info: StepInfo, outcome: StepOutcome): void {
      const voice = voices.get(info.id);
      place(info)?.classList.remove("speaking");
      if (voice === undefined) return;
      voice.status.textContent = "";
      voice.item.dataset["state"] = outcome.kind;
      const name = nameOf(info);
      switch (outcome.kind) {
        case "spoken":
          voice.text.data = outcome.text;
          announce(`${name}: ${outcome.text}`);
          break;
        case "recorded":
          voice.text.data = outcome.text;
          voice.status.textContent = outcome.credit;
          announce(`${name}, recorded: ${outcome.text}`);
          break;
        case "not-invited":
          voice.status.textContent = NOT_INVITED_MESSAGE;
          announce(`${name}. ${NOT_INVITED_MESSAGE}`);
          break;
        case "unavailable":
          voice.status.textContent = UNAVAILABLE_MESSAGE;
          announce(`${name}. ${UNAVAILABLE_MESSAGE}`);
          break;
      }
    },

    ritualFinished(reason: RitualEnd): void {
      clearSpeaking();
      for (const voice of voices.values()) {
        if (voice.item.dataset["state"] === "speaking") voice.item.dataset["state"] = "stopped";
      }
      endLine.textContent = END_MESSAGES[reason];
      announce(END_MESSAGES[reason]);
    },
  };
}
