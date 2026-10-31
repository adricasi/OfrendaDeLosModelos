import type { AltarData } from "../data/load.js";
import type { Ancestor, CreditSource, DarkFrame } from "../data/validate.js";
import { MEDIUM_MODEL_ID } from "../ritual/plan.js";
import {
  emblemSvg,
  renderArchLegs,
  renderArchTop,
  renderDefinitions,
  renderMarigoldBed,
  renderOfferings,
  renderPapelPicado,
  renderPetalPath,
  renderTopCandles,
  veladora,
} from "./art.js";
import { startPetalDrift } from "./motion.js";

/**
 * Renders the static altar from validated data. Every data string goes in through
 * textContent / setAttribute on elements we create: never as HTML (design.md, Security).
 */

const PETAL_COUNT = 46;

function byId(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (element === null) throw new Error(`index.html is missing #${id}`);
  return element;
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className !== undefined) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function link(doc: Document, href: string, text: string): HTMLAnchorElement {
  const anchor = el(doc, "a", undefined, text);
  anchor.href = href;
  return anchor;
}

function kindLabel(ancestor: Ancestor): string {
  return ancestor.kind === "live" ? "Speaks live, on your device" : "Speaks through recordings";
}

function renderPlace(doc: Document, ancestor: Ancestor, index: number): HTMLLIElement {
  // The one who tends the altar (Gemma 4) has the top level, near the candles.
  const tends = ancestor.id === MEDIUM_MODEL_ID;
  const item = el(doc, "li", `place place-${ancestor.kind}${tends ? " place-medium" : ""}`);
  item.dataset["ancestorId"] = ancestor.id;
  item.dataset["family"] = ancestor.family.toLowerCase();
  const figure = el(doc, "figure", "frame");
  const portrait = el(doc, "div", "portrait");
  portrait.append(emblemSvg(doc, ancestor.family, ancestor.id));
  // The candle lights while this ancestor speaks (see ritual-view.ts).
  portrait.append(
    veladora(doc, { height: 1.7, tint: index % 4, glow: 4.5, phase: index * 0.9 + 0.3 }),
  );
  portrait.lastElementChild?.classList.add("place-candle");
  const caption = el(doc, "figcaption");
  caption.append(el(doc, "strong", "name", ancestor.name));
  if (tends) {
    const role = el(doc, "span", "role", "La que cuida el altar");
    role.lang = "es";
    caption.append(role);
  }
  caption.append(
    el(doc, "span", "year", String(ancestor.year)),
    el(doc, "span", "kind", kindLabel(ancestor)),
  );
  figure.append(portrait, caption);
  item.append(figure);
  return item;
}

function renderDarkFrame(doc: Document, frame: DarkFrame): HTMLLIElement {
  const item = el(doc, "li", "dark-frame");
  const figure = el(doc, "figure", "frame frame-dark");
  figure.append(el(doc, "div", "portrait"));
  const caption = el(doc, "figcaption");
  caption.append(el(doc, "strong", "name", frame.name), el(doc, "span", "maker", frame.maker));
  if (frame.yearsOfService !== null) {
    caption.append(el(doc, "span", "years", `In service: ${frame.yearsOfService}`));
  }
  const when = el(doc, "span", "retired", `${frame.event} `);
  when.append(link(doc, frame.sourceUrl, frame.date));
  caption.append(when, el(doc, "span", "never", "Its weights were never released."));
  figure.append(caption);
  item.append(figure);
  return item;
}

function renderModelLine(doc: Document, ancestor: Ancestor): HTMLLIElement {
  const item = el(doc, "li");
  item.dataset["ancestorId"] = ancestor.id;
  if (ancestor.kind === "live") {
    item.append(
      el(doc, "strong", undefined, ancestor.name),
      " (live). Licence: ",
      link(doc, ancestor.licence.url, ancestor.licence.name),
      ". ",
    );
  } else {
    // AC-009.1: recorded voices are credited under the model's own licence.
    item.append(
      el(doc, "strong", undefined, ancestor.name),
      " (recorded). Model licence: ",
      link(doc, ancestor.licence.url, ancestor.licence.name),
      "; output reproduced with attribution. ",
    );
  }
  item.append(link(doc, ancestor.modelCardUrl, "Model card"), ".");
  return item;
}

/** The medium is Gemma 4 E2B speaking in its own role; it is listed with that model's licence. */
function renderMediumLine(doc: Document, ancestor: Ancestor): HTMLLIElement {
  const item = el(doc, "li");
  item.dataset["role"] = "medium";
  const name = el(doc, "strong", undefined, "La que cuida el altar");
  name.lang = "es";
  item.append(
    name,
    ` is ${ancestor.name}, live on your device or, in browsers without WebGPU, recorded. Licence: `,
    link(doc, ancestor.licence.url, ancestor.licence.name),
    ". ",
    link(doc, ancestor.modelCardUrl, "Model card"),
    ".",
  );
  return item;
}

function renderSourceLine(doc: Document, source: CreditSource): HTMLLIElement {
  const item = el(doc, "li");
  item.append(link(doc, source.url, source.title), `, ${source.publisher}. ${source.usedFor}.`);
  return item;
}

/** The decoration around the places: papel picado, the arch, candles, offerings, the petal path. */
function renderScene(doc: Document): void {
  const defs = byId(doc, "art-defs") as unknown as SVGSVGElement;
  renderDefinitions(doc, defs);
  const definitions = defs.querySelector("defs");
  if (definitions !== null) renderArchLegs(doc, definitions, [76, 44]);
  renderPapelPicado(doc, byId(doc, "papel-picado") as unknown as SVGSVGElement);
  renderArchTop(doc, byId(doc, "arch-top") as unknown as SVGSVGElement);
  renderTopCandles(doc, byId(doc, "top-candles"));
  renderOfferings(doc, byId(doc, "offerings"));
  renderMarigoldBed(doc, byId(doc, "marigold-bed"));
  renderPetalPath(doc, byId(doc, "petals"), PETAL_COUNT);
  byId(doc, "unlit-candle").replaceChildren(
    veladora(doc, { height: 2.6, tint: 3, glow: 0.1, phase: 0 }),
  );
}

/** Starts the drifting petals. Called once by the page, not by tests (no canvas in jsdom). */
export function startAltarMotion(doc: Document): void {
  const canvas = doc.getElementById("petal-drift");
  if (canvas instanceof HTMLCanvasElement) startPetalDrift(canvas);
}

export function renderAltar(doc: Document, data: AltarData): void {
  const places = byId(doc, "places");
  places.replaceChildren(...data.ancestors.map((a, index) => renderPlace(doc, a, index)));
  renderScene(doc);

  const darkSection = byId(doc, "dark-frames-section");
  byId(doc, "dark-frames").replaceChildren(...data.darkFrames.map((f) => renderDarkFrame(doc, f)));
  darkSection.hidden = data.darkFrames.length === 0;

  const medium = data.ancestors.find((a) => a.id === MEDIUM_MODEL_ID);
  byId(doc, "about-models").replaceChildren(
    ...data.ancestors.map((a) => renderModelLine(doc, a)),
    ...(medium === undefined ? [] : [renderMediumLine(doc, medium)]),
  );
  byId(doc, "cultural-review").hidden = !data.credits.culturalReviewPending;
  byId(doc, "about-sources").replaceChildren(
    ...data.credits.sources.map((s) => renderSourceLine(doc, s)),
  );
  byId(doc, "about-assets").textContent = data.credits.assets;
}

/** REQ-010: the one line shown when the browser has no WebGPU. */
export function showBrowserNote(doc: Document, message: string): void {
  const note = byId(doc, "browser-note");
  note.textContent = message;
  note.hidden = false;
}

/** REQ-011: said once, after a complete ritual, when the service worker has the shell ready. */
export const OFFLINE_READY_MESSAGE = "This altar now works offline on this device.";

export function showOfflineNote(doc: Document): void {
  const note = byId(doc, "offline-note");
  note.textContent = OFFLINE_READY_MESSAGE;
}

export function showLoadError(doc: Document, error: unknown): void {
  const box = byId(doc, "load-error");
  const detail = error instanceof Error ? error.message : String(error);
  box.textContent = `The altar could not be prepared. ${detail}`;
  box.hidden = false;
}

/** Wires the about link to show and hide the panel; keeps aria-expanded in sync. */
export function wireAboutPanel(doc: Document): void {
  const trigger = byId(doc, "about-link");
  const panel = byId(doc, "about");
  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      panel.dispatchEvent(new Event("about-opened"));
      panel.tabIndex = -1;
      panel.focus();
    } else {
      trigger.focus();
    }
  };
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    setOpen(panel.hidden);
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) setOpen(false);
  });
}
