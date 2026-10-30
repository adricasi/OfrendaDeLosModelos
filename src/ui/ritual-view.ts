import type { Alternative } from "../worker/protocol.js";
import type {
  ConsentRequest,
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

/** How a ghost word's probability reads on hover and focus: "20%", "5.0%", "<0.1%". */
export function formatProbability(p: number): string {
  if (p < 0.001) return "<0.1%";
  const percent = p * 100;
  return `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
}

/** How a token shows inside a ghost list: whitespace-only tokens get a visible mark. */
function visibleToken(text: string): string {
  const trimmed = text.trim();
  if (trimmed !== "") return trimmed;
  return text.includes("\n") ? "↵" : "␣";
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** The size the visitor consents to: "1.9 GB", or "480 MB" for smaller downloads. */
export function formatDownloadSize(bytes: number): string {
  return bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toFixed(1)} GB`
    : `${String(Math.round(bytes / 1_000_000))} MB`;
}

/** AC-006.2: what the visitor reads before Gemma 4 is downloaded. */
export function consentMessage(request: ConsentRequest): string {
  const size =
    request.bytes === null
      ? "Its download size has not been verified yet."
      : `It is a download of about ${formatDownloadSize(request.bytes)}.`;
  return `${request.modelName} is not stored on this device yet. ${size} It stays in your browser for later visits, and nothing you write leaves your device.`;
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
  readonly label: HTMLElement;
  readonly textEl: HTMLElement;
  /** The text node plain tokens are appended to (the tail of `textEl`). */
  text: Text;
  readonly status: HTMLElement;
  /** Token units with ghost words, in order; one of them is the roving tab stop. */
  readonly units: HTMLElement[];
  /** Screen-reader list of what the model almost said, outside the answer text. */
  notes: HTMLElement | null;
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

  const appendPlain = (voice: VoiceElements, text: string): void => {
    if (voice.textEl.lastChild !== voice.text) {
      voice.text = doc.createTextNode("");
      voice.textEl.append(voice.text);
    }
    voice.text.appendData(text);
  };

  /**
   * One token with its ghost words (AC-004.1, AC-004.2). The visible ghosts are decoration
   * (aria-hidden). The text "almost: X, Y, Z" sits in a hidden block and is the accessible
   * description of the token (aria-describedby), so a screen reader reads the answer straight
   * through, and says what the model almost said when focus reaches a word. One visually hidden
   * line per answer explains this; nothing is repeated 60 times. Probabilities show on hover,
   * focus and tap, can be dismissed with Escape and stay while the pointer is over them
   * (WCAG 1.4.13); the units form one tab stop moved with the arrow keys.
   */
  const appendGhostToken = (
    voice: VoiceElements,
    stepId: string,
    text: string,
    alternatives: readonly Alternative[],
  ): void => {
    const body = text.trim();
    const start = text.indexOf(body === "" ? text : body);
    const lead = body === "" ? text : text.slice(0, start);
    const trail = body === "" ? "" : text.slice(start + body.length);
    if (lead !== "") appendPlain(voice, lead);

    const noteId = `${stepId}-almost-${String(voice.units.length + 1)}`;
    const unit = make(doc, "span", "token");
    unit.tabIndex = voice.units.length === 0 ? 0 : -1;
    unit.setAttribute("aria-describedby", noteId);
    const shown = body === "" ? visibleToken(text) : body;
    const word = make(doc, "span", "token-text", shown);
    if (body === "") word.setAttribute("aria-hidden", "true");
    const ghosts = make(doc, "span", "ghosts");
    ghosts.setAttribute("aria-hidden", "true");
    for (const alternative of alternatives) {
      const ghost = make(doc, "span", "ghost");
      ghost.append(
        make(doc, "span", "ghost-word", visibleToken(alternative.text)),
        make(doc, "span", "ghost-p", formatProbability(alternative.p)),
      );
      ghosts.append(ghost);
    }
    unit.append(word, ghosts);
    voice.textEl.append(unit);
    voice.units.push(unit);
    voice.text = doc.createTextNode("");
    voice.textEl.append(voice.text);
    if (trail !== "") voice.text.appendData(trail);

    if (voice.notes === null) {
      const summary = make(
        doc,
        "p",
        "ghost-summary visually-hidden",
        "Each word has ghost words: use the arrow keys on the answer to hear what the model almost said at that word.",
      );
      voice.textEl.before(summary);
      voice.notes = make(doc, "div", "ghost-notes");
      voice.notes.hidden = true;
      voice.item.append(voice.notes);
    }
    const note = doc.createElement("p");
    note.id = noteId;
    note.textContent = `${shown}: almost: ${alternatives.map((a) => visibleToken(a.text)).join(", ")}`;
    voice.notes.append(note);
  };

  const moveFocus = (voice: VoiceElements, from: HTMLElement, key: string): HTMLElement | null => {
    const index = voice.units.indexOf(from);
    if (index === -1) return null;
    const last = voice.units.length - 1;
    const target =
      key === "ArrowRight" || key === "ArrowDown"
        ? Math.min(index + 1, last)
        : key === "ArrowLeft" || key === "ArrowUp"
          ? Math.max(index - 1, 0)
          : key === "Home"
            ? 0
            : key === "End"
              ? last
              : -1;
    return voice.units[target] ?? null;
  };

  const setRoving = (voice: VoiceElements, active: HTMLElement): void => {
    for (const unit of voice.units) unit.tabIndex = unit === active ? 0 : -1;
  };

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
      item.append(name, label);
      if (info.caveat !== undefined) item.append(make(doc, "p", "voice-caveat", info.caveat));
      item.append(text, status);
      list.append(item);
      const voice: VoiceElements = {
        item,
        label,
        textEl: text,
        text: textNode,
        status,
        units: [],
        notes: null,
      };
      voices.set(info.id, voice);
      text.addEventListener("keydown", (event) => {
        const from =
          event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(".token") : null;
        if (from === null) return;
        if (event.key === "Escape") {
          // WCAG 1.4.13: the probabilities can be dismissed without moving focus or pointer.
          from.dataset["dismissed"] = "";
          return;
        }
        const next = moveFocus(voice, from, event.key);
        if (next === null) return;
        event.preventDefault();
        setRoving(voice, next);
        next.focus();
      });
      const forget = (event: Event): void => {
        const unit =
          event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(".token") : null;
        if (unit !== null) delete unit.dataset["dismissed"];
      };
      text.addEventListener("focusout", forget);
      text.addEventListener("pointerout", forget);
      // A tap focuses the word (not every mobile browser focuses a span on its own).
      text.addEventListener("click", (event) => {
        const unit =
          event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(".token") : null;
        unit?.focus();
      });
      text.addEventListener("focusin", (event) => {
        const unit =
          event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(".token") : null;
        if (unit !== null) setRoving(voice, unit);
      });
      place(info)?.classList.add("speaking");
    },

    stepStatus(stepId: string, message: string): void {
      const voice = voices.get(stepId);
      if (voice !== undefined) voice.status.textContent = message;
    },

    askConsent(stepId: string, request: ConsentRequest, signal: AbortSignal): Promise<boolean> {
      const voice = voices.get(stepId);
      if (voice === undefined) return Promise.resolve(true);
      return new Promise<boolean>((resolve, reject) => {
        const message = consentMessage(request);
        const box = make(doc, "div", "consent");
        box.setAttribute("role", "group");
        const text = make(doc, "p", "consent-text", message);
        text.id = `${stepId}-consent-text`;
        box.setAttribute("aria-labelledby", text.id);
        const accept = make(doc, "button", "consent-accept", "Download and continue");
        accept.type = "button";
        const decline = make(doc, "button", "consent-decline secondary", "Not now");
        decline.type = "button";
        box.append(text, accept, decline);
        voice.item.append(box);
        announce(`${request.modelName} asks to download. ${message}`);
        const close = (action: () => void): void => {
          signal.removeEventListener("abort", onAbort);
          box.remove();
          action();
        };
        const onAbort = (): void => {
          close(() => {
            reject(new DOMException("The ritual was stopped.", "AbortError"));
          });
        };
        accept.addEventListener("click", () => {
          close(() => {
            resolve(true);
          });
        });
        decline.addEventListener("click", () => {
          close(() => {
            resolve(false);
          });
        });
        signal.addEventListener("abort", onAbort, { once: true });
        accept.focus();
      });
    },

    stepProgress(stepId: string, loaded: number, total: number): void {
      const voice = voices.get(stepId);
      if (voice === undefined || total <= 0) return;
      const percent = String(Math.round((loaded / total) * 100));
      // The size is the real download total, so the visitor sees what is being fetched (NFR-005).
      voice.status.textContent = `Preparing… ${percent}% (${formatBytes(loaded)} of ${formatBytes(total)})`;
    },

    token(stepId: string, token: Token): void {
      const voice = voices.get(stepId);
      if (voice === undefined) return;
      voice.status.textContent = "";
      if (token.alternatives === undefined || token.alternatives.length === 0) {
        appendPlain(voice, token.text);
      } else {
        appendGhostToken(voice, stepId, token.text, token.alternatives);
      }
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
          // Ghost words stay as they were streamed; plain answers are set to the final text.
          if (voice.units.length === 0) voice.textEl.textContent = outcome.text;
          // The medium answers in the question's language (AC-007.2), so its announcement is
          // tagged with it; the other ancestors' language is not known.
          const lang = info.mode === "medium" ? questionLang : null;
          if (outcome.notes === undefined) {
            announce(`${name}: ${outcome.text}`, lang);
            break;
          }
          // One block per ancestor, inside the medium's own step (reading order stays linear).
          voice.textEl.textContent = "";
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
        case "recorded": {
          // A step that was meant to speak live (Gemma 4 declined) is now a recording.
          voice.label.textContent = MODE_LABELS.recorded;
          voice.status.textContent = outcome.credit;
          if (outcome.notes === undefined) {
            voice.textEl.textContent = outcome.text;
            announce(`${name}, recorded: ${outcome.text}`);
            break;
          }
          // The recorded medium's words, one block per ancestor, labelled as recorded.
          voice.textEl.textContent = "";
          const notes = outcome.notes;
          voice.item.append(...notes.map((note) => renderNote(note, names.get(note.ancestorId))));
          announce(
            `${name}, recorded: ${notes
              .map(
                (n) =>
                  `${names.get(n.ancestorId) ?? n.ancestorId}. ${n.meaning} ${n.calaverita.join(" ")}`,
              )
              .join(" ")}`,
            questionLang,
          );
          break;
        }
        case "not-invited":
          {
            // The medium has no altar place (ancestorId null); it gets its own wording.
            const message =
              outcome.message ??
              (info.ancestorId === null ? MEDIUM_NOT_INVITED_MESSAGE : NOT_INVITED_MESSAGE);
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
