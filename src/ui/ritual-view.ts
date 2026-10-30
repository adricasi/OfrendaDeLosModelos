import type {
  MediumNote,
  Question,
  RitualEnd,
  RitualView,
  StepInfo,
  StepOutcome,
  Token,
} from "../ritual/types.js";

export const UNAVAILABLE_MESSAGE = "This ancestor could not come tonight.";
export const GATHERING_MESSAGE =
  "The recorded voices are still being gathered. This ancestor will speak here soon.";
export const MEDIUM_NOT_INVITED_MESSAGE =
  "La que cuida el altar only speaks for questions the ancestors left for us.";
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

function renderNote(note: MediumNote, ancestorName: string | undefined): HTMLElement {
  const block = document.createElement("section");
  block.className = "medium-note";
  block.dataset["ancestorId"] = note.ancestorId;
  const heading = document.createElement("h4");
  heading.textContent = ancestorName ?? note.ancestorId;
  const meaning = document.createElement("p");
  meaning.className = "medium-meaning";
  meaning.textContent = note.meaning;
  const poem = document.createElement("p");
  poem.className = "medium-calaverita";
  poem.textContent = note.calaverita.join("\n");
  block.append(heading, meaning, poem);
  return block;
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

  const announce = (message: string, lang?: string | null): void => {
    const line = make(doc, "p", "", message);
    if (lang !== undefined && lang !== null) line.lang = lang;
    announcer.append(line);
  };
  const names = new Map<string, string>();
  let questionLang: Question["lang"] = null;
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
      names.clear();
      questionLang = question.lang;
      list.replaceChildren();
      announcer.replaceChildren();
      endLine.textContent = "";
      questionLine.textContent = question.text;
      if (question.lang === null) questionLine.removeAttribute("lang");
      else questionLine.lang = question.lang;
      section.hidden = false;
      announce(`The ritual begins. Your question: ${question.text}`, question.lang);
    },

    stepStarted(info: StepInfo): void {
      if (info.ancestorId !== null) names.set(info.ancestorId, info.name);
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
        case "spoken": {
          voice.text.data = outcome.text;
          // The medium answers in the question's language (AC-007.2), so its announcement is
          // tagged with it; the other ancestors' language is not known.
          const lang = info.mode === "medium" ? questionLang : null;
          if (outcome.notes === undefined) {
            announce(`${name}: ${outcome.text}`, lang);
            break;
          }
          // One block per ancestor, inside the medium's own step (reading order stays linear).
          voice.text.data = "";
          const notes = outcome.notes;
          voice.item.append(...notes.map((note) => renderNote(note, names.get(note.ancestorId))));
          announce(
            `${name}: ${notes
              .map(
                (n) =>
                  `${names.get(n.ancestorId) ?? n.ancestorId}. ${n.meaning} ${n.calaverita.join(" ")}`,
              )
              .join(" ")}`,
            lang,
          );
          break;
        }
        case "recorded":
          voice.text.data = outcome.text;
          voice.status.textContent = outcome.credit;
          announce(`${name}, recorded: ${outcome.text}`);
          break;
        case "not-invited":
          {
            // The medium has no altar place (ancestorId null); it gets its own wording.
            const message =
              info.ancestorId === null ? MEDIUM_NOT_INVITED_MESSAGE : NOT_INVITED_MESSAGE;
            voice.status.textContent = message;
            announce(`${name}. ${message}`);
          }
          break;
        case "gathering":
          voice.status.textContent = GATHERING_MESSAGE;
          announce(`${name}. ${GATHERING_MESSAGE}`);
          break;
        case "unavailable":
          // Tokens that arrived before the failure stay visible: what the ancestor managed to
          // say is kept, and the message below says it could not finish.
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
