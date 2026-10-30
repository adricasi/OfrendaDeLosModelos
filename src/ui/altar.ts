import type { AltarData } from "../data/load.js";
import type { Ancestor, CreditSource, DarkFrame } from "../data/validate.js";

/**
 * Renders the static altar from validated data. Every data string goes in through
 * textContent / setAttribute on elements we create: never as HTML (design.md, Security).
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const PETAL_COUNT = 18;

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
  anchor.rel = "noopener noreferrer";
  return anchor;
}

function portraitSvg(doc: Document): SVGSVGElement {
  // An abstract silhouette: ancestors here are models, so there is no face to draw.
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 60 72");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const head = doc.createElementNS(SVG_NS, "circle");
  head.setAttribute("cx", "30");
  head.setAttribute("cy", "26");
  head.setAttribute("r", "11");
  const shoulders = doc.createElementNS(SVG_NS, "path");
  shoulders.setAttribute("d", "M8 72c0-18 10-26 22-26s22 8 22 26Z");
  svg.append(head, shoulders);
  return svg;
}

function kindLabel(ancestor: Ancestor): string {
  return ancestor.kind === "live" ? "Speaks live, on your device" : "Speaks through recordings";
}

function renderPlace(doc: Document, ancestor: Ancestor): HTMLLIElement {
  const item = el(doc, "li", `place place-${ancestor.kind}`);
  item.dataset["ancestorId"] = ancestor.id;
  const figure = el(doc, "figure", "frame");
  const portrait = el(doc, "div", "portrait");
  portrait.append(portraitSvg(doc));
  const caption = el(doc, "figcaption");
  caption.append(
    el(doc, "strong", "name", ancestor.name),
    el(doc, "span", "year", String(ancestor.year)),
    el(doc, "span", "kind", kindLabel(ancestor)),
  );
  figure.append(portrait, caption);
  item.append(figure);
  return item;
}

function renderPetals(doc: Document, container: HTMLElement): void {
  container.replaceChildren();
  for (let index = 0; index < PETAL_COUNT; index += 1) {
    const petal = el(doc, "span", "petal");
    // CSSOM (not a style attribute) so it stays valid under style-src 'self'.
    petal.style.setProperty("--i", String(index));
    container.append(petal);
  }
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
  const how = ancestor.kind === "live" ? "live" : "recorded";
  item.append(
    el(doc, "strong", undefined, ancestor.name),
    ` (${how}). Licence: `,
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

export function renderAltar(doc: Document, data: AltarData): void {
  const places = byId(doc, "places");
  places.replaceChildren(...data.ancestors.map((a) => renderPlace(doc, a)));
  renderPetals(doc, byId(doc, "petals"));

  const darkSection = byId(doc, "dark-frames-section");
  byId(doc, "dark-frames").replaceChildren(...data.darkFrames.map((f) => renderDarkFrame(doc, f)));
  darkSection.hidden = data.darkFrames.length === 0;

  byId(doc, "about-models").replaceChildren(...data.ancestors.map((a) => renderModelLine(doc, a)));
  byId(doc, "about-sources").replaceChildren(
    ...data.credits.sources.map((s) => renderSourceLine(doc, s)),
  );
  byId(doc, "about-assets").textContent = data.credits.assets;
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
      panel.tabIndex = -1;
      panel.focus();
    }
  };
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    setOpen(panel.hidden);
  });
}
