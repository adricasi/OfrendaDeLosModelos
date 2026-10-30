/**
 * The altar's art, drawn in code: original SVG and DOM, no images and no libraries. Every
 * function builds elements with createElementNS / createElement and sets attributes: never
 * HTML strings (design.md, Security). Colours come from the stylesheet (classes and custom
 * properties), so the palette lives in one place (src/styles.css, tokens).
 *
 * Randomness is seeded: the hand-cut irregularity is the same on every visit, so a screenshot
 * or a test run always sees the same altar.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

type Attributes = Readonly<Record<string, string | number>>;

export function svgEl<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attributes: Attributes = {},
  ...children: readonly Element[]
): SVGElementTagNameMap[K] {
  const element = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  element.append(...children);
  return element;
}

function htmlEl<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  element.className = className;
  return element;
}

/** Small seeded generator (mulberry32): deterministic, good enough for decoration. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (random: () => number, low: number, high: number): number =>
  low + random() * (high - low);

const round = (value: number): string => String(Math.round(value * 10) / 10);

/* ------------------------------------------------------------------ shared definitions */

const MARIGOLD_RINGS = [
  { count: 16, radius: 33, rx: 8.5, ry: 15, className: "mg-1", turn: 0 },
  { count: 12, radius: 23, rx: 7.5, ry: 13, className: "mg-2", turn: 8 },
  { count: 8, radius: 13, rx: 6, ry: 10, className: "mg-3", turn: 17 },
] as const;

/** A cempasúchil head seen from the front: three rings of ruffled petals. */
function marigoldSymbol(doc: Document, id: string, tone: string): SVGSymbolElement {
  const group = svgEl(doc, "g", { class: tone });
  for (const ring of MARIGOLD_RINGS) {
    for (let index = 0; index < ring.count; index += 1) {
      const angle = ring.turn + (360 / ring.count) * index;
      group.append(
        svgEl(doc, "ellipse", {
          class: ring.className,
          cx: 0,
          cy: -ring.radius,
          rx: ring.rx,
          ry: ring.ry,
          transform: `rotate(${round(angle)})`,
        }),
      );
    }
  }
  group.append(svgEl(doc, "circle", { class: "mg-c", r: 4.5 }));
  return svgEl(doc, "symbol", { id, viewBox: "-50 -50 100 100", overflow: "visible" }, group);
}

/** A leaf: green cut paper, a pointed oval with a centre vein. */
function leafSymbol(doc: Document): SVGSymbolElement {
  return svgEl(
    doc,
    "symbol",
    { id: "leaf", viewBox: "-10 -30 20 60", overflow: "visible" },
    svgEl(doc, "path", { class: "leaf", d: "M0-28C12-14 12 14 0 28C-12 14-12-14 0-28Z" }),
    svgEl(doc, "path", { class: "leaf-vein", d: "M0-22V22" }),
  );
}

function embroideryPattern(doc: Document): SVGPatternElement {
  // Cross-stitch bordado: a row of eight-point stars between two thread lines.
  const cross = (x: number, y: number, className: string): SVGPathElement =>
    svgEl(doc, "path", {
      class: className,
      d: `M${x - 3} ${y - 3}L${x + 3} ${y + 3}M${x + 3} ${y - 3}L${x - 3} ${y + 3}`,
    });
  return svgEl(
    doc,
    "pattern",
    { id: "bordado", width: 24, height: 20, patternUnits: "userSpaceOnUse" },
    svgEl(doc, "rect", { class: "bordado-ground", width: 24, height: 20 }),
    svgEl(doc, "path", { class: "bordado-line", d: "M0 2.5H24M0 17.5H24" }),
    svgEl(doc, "path", { class: "bordado-diamond", d: "M12 4L19 10L12 16L5 10Z" }),
    svgEl(doc, "path", { class: "bordado-diamond-in", d: "M12 7.5L15.5 10L12 12.5L8.5 10Z" }),
    cross(0, 10, "bordado-stitch"),
    cross(24, 10, "bordado-stitch"),
  );
}

function smokeFilter(doc: Document): SVGFilterElement {
  return svgEl(
    doc,
    "filter",
    { id: "smoke", x: "-60%", y: "-20%", width: "220%", height: "140%" },
    svgEl(doc, "feTurbulence", {
      type: "fractalNoise",
      baseFrequency: "0.035 0.012",
      numOctaves: 2,
      seed: 7,
      result: "noise",
    }),
    svgEl(doc, "feDisplacementMap", {
      in: "SourceGraphic",
      in2: "noise",
      scale: 16,
      xChannelSelector: "R",
      yChannelSelector: "G",
      result: "displaced",
    }),
    svgEl(doc, "feGaussianBlur", { in: "displaced", stdDeviation: 1.1 }),
  );
}

function grainFilter(doc: Document): SVGFilterElement {
  return svgEl(
    doc,
    "filter",
    { id: "paper-grain", x: "0%", y: "0%", width: "100%", height: "100%" },
    svgEl(doc, "feTurbulence", {
      type: "fractalNoise",
      baseFrequency: "0.9",
      numOctaves: 2,
      seed: 3,
      result: "grain",
    }),
    svgEl(doc, "feColorMatrix", { in: "grain", type: "saturate", values: 0 }),
  );
}

function shadeGradient(doc: Document): SVGLinearGradientElement {
  return svgEl(
    doc,
    "linearGradient",
    { id: "flag-shade", x1: 0, y1: 0, x2: 0, y2: 1 },
    svgEl(doc, "stop", { offset: 0, class: "shade-top" }),
    svgEl(doc, "stop", { offset: 0.35, class: "shade-mid" }),
    svgEl(doc, "stop", { offset: 1, class: "shade-low" }),
  );
}

/** Symbols, patterns and filters used across the altar; referenced by id from the art. */
export function renderDefinitions(doc: Document, target: SVGSVGElement): void {
  target.replaceChildren(
    svgEl(
      doc,
      "defs",
      {},
      marigoldSymbol(doc, "mg-a", "mg-a"),
      marigoldSymbol(doc, "mg-b", "mg-b"),
      marigoldSymbol(doc, "mg-c", "mg-c"),
      leafSymbol(doc),
      embroideryPattern(doc),
      smokeFilter(doc),
      grainFilter(doc),
      shadeGradient(doc),
    ),
  );
}

/* ------------------------------------------------------------------ papel picado */

const FLAG_COLOURS = 6;

interface FlagShape {
  readonly outline: string;
  readonly cuts: string;
  readonly height: number;
}

function scallopedEdge(
  random: () => number,
  halfWidth: number,
  y: number,
  kind: "scallop" | "fringe" | "point",
): string {
  const width = halfWidth * 2;
  const count = Math.max(5, Math.round(width / between(random, 9, 12)));
  const step = width / count;
  let path = "";
  for (let index = 0; index < count; index += 1) {
    const xRight = halfWidth - step * index;
    const xLeft = xRight - step;
    const depth = between(random, 0.7, 1.35);
    if (kind === "scallop") {
      const radius = (step / 2) * between(random, 0.95, 1.12);
      path += `L${round(xRight)} ${round(y)}A${round(radius)} ${round(radius * depth)} 0 0 1 ${round(xLeft)} ${round(y)}`;
    } else if (kind === "fringe") {
      const tooth = between(random, 5, 11);
      const gap = step * 0.14;
      path += `L${round(xRight)} ${round(y)}L${round(xRight)} ${round(y + tooth)}L${round(xLeft + gap)} ${round(y + tooth + between(random, -1.5, 1.5))}L${round(xLeft + gap)} ${round(y)}`;
    } else {
      path += `L${round(xRight)} ${round(y)}L${round(xRight - step / 2)} ${round(y + step * depth * 0.9)}L${round(xLeft)} ${round(y)}`;
    }
  }
  return path;
}

/** Eight cut petals around a small round hole: the flower motif. */
function flowerCut(cx: number, cy: number, size: number, petals: number, turn: number): string {
  let path = "";
  for (let index = 0; index < petals; index += 1) {
    const angle = turn + (Math.PI * 2 * index) / petals;
    const along = (distance: number, side: number): string => {
      const x = cx + Math.sin(angle) * distance + Math.cos(angle) * side;
      const y = cy - Math.cos(angle) * distance + Math.sin(angle) * side;
      return `${round(x)} ${round(y)}`;
    };
    path += `M${along(size * 0.28, 0)}C${along(size * 0.5, -size * 0.34)} ${along(size * 0.85, -size * 0.2)} ${along(size, 0)}C${along(size * 0.85, size * 0.2)} ${along(size * 0.5, size * 0.34)} ${along(size * 0.28, 0)}Z`;
  }
  path += `M${round(cx + size * 0.14)} ${round(cy)}a${round(size * 0.14)} ${round(size * 0.14)} 0 1 0 ${round(-size * 0.28)} 0a${round(size * 0.14)} ${round(size * 0.14)} 0 1 0 ${round(size * 0.28)} 0Z`;
  return path;
}

/** A small bird (a paloma) facing right, with one wing left as paper inside the cut. */
function birdCut(cx: number, cy: number, scale: number, flip: boolean): string {
  const s = flip ? -scale : scale;
  const p = (x: number, y: number): string => `${round(cx + x * s)} ${round(cy + y * scale)}`;
  const body = `M${p(-14, 6)}L${p(-7, 4)}C${p(-6, -3)} ${p(-1, -8)} ${p(5, -8)}C${p(10, -8)} ${p(12, -4)} ${p(12, -2)}L${p(18, -1)}L${p(12, 1)}C${p(11, 6)} ${p(6, 10)} ${p(-1, 10)}C${p(-4, 10)} ${p(-6, 8)} ${p(-7, 6)}L${p(-14, 12)}Z`;
  const wing = `M${p(-4, 3)}C${p(-2, -1)} ${p(3, -3)} ${p(7, -2)}C${p(4, 1)} ${p(1, 4)} ${p(-4, 3)}Z`;
  return body + wing;
}

function dots(startX: number, endX: number, y: number, radius: number, count: number): string {
  let path = "";
  const step = (endX - startX) / Math.max(1, count - 1);
  for (let index = 0; index < count; index += 1) {
    const x = startX + step * index;
    path += `M${round(x + radius)} ${round(y)}a${radius} ${radius} 0 1 0 ${round(-radius * 2)} 0a${radius} ${radius} 0 1 0 ${round(radius * 2)} 0Z`;
  }
  return path;
}

function flagShape(random: () => number, width: number): FlagShape {
  const half = width / 2;
  const sideHeight = between(random, 54, 70);
  const kind = (["scallop", "fringe", "point"] as const)[Math.floor(random() * 3)] ?? "scallop";
  let outline = `M${-half} 0H${half}V${round(sideHeight)}`;
  outline += scallopedEdge(random, half, sideHeight, kind);
  outline += `L${-half} ${round(sideHeight)}Z`;

  let cuts = dots(-half + 7, half - 7, 15, 1.8, Math.round(width / 11));
  const motif = random();
  if (motif < 0.45) {
    cuts += flowerCut(0, 35, between(random, 13, 17), random() < 0.5 ? 8 : 6, random() * 0.5);
    cuts += flowerCut(-half + 11, sideHeight - 15, 5, 5, 0.2);
    cuts += flowerCut(half - 11, sideHeight - 15, 5, 5, 0.6);
  } else if (motif < 0.8) {
    cuts += birdCut(-3, 36, between(random, 1.05, 1.3), random() < 0.5);
    cuts += flowerCut(-half + 10, 30, 5.5, 5, 0.4);
    cuts += flowerCut(half - 10, 30, 5.5, 5, 0.1);
  } else {
    cuts += flowerCut(-half * 0.4, 36, 9, 6, 0.3);
    cuts += flowerCut(half * 0.4, 36, 9, 6, 0.8);
    cuts += `M0 24L6 32L0 40L-6 32Z`;
  }
  // Small cuts near the lower edge, inset so the edge itself stays whole.
  cuts += dots(-half + 12, half - 12, sideHeight - 6, 1.5, Math.max(3, Math.round(width / 16)));
  return { outline, cuts, height: sideHeight + 10 };
}

interface RowOptions {
  readonly y0: number;
  readonly y1: number;
  readonly sag: number;
  readonly count: number;
  readonly scale: number;
  readonly seed: number;
  readonly first: number;
}

function stringPoint(
  options: RowOptions,
  t: number,
  width: number,
): { x: number; y: number; d: string } {
  const x0 = -30;
  const x1 = width + 30;
  const control = (options.y0 + options.y1) / 2 + options.sag * 2;
  const x = x0 + (x1 - x0) * t;
  const y = (1 - t) ** 2 * options.y0 + 2 * (1 - t) * t * control + t ** 2 * options.y1;
  return { x, y, d: `M${x0} ${options.y0}Q${(x0 + x1) / 2} ${control} ${x1} ${options.y1}` };
}

function papelRow(doc: Document, root: SVGGElement, options: RowOptions, width: number): void {
  const random = seeded(options.seed);
  const string = stringPoint(options, 0, width).d;
  root.append(svgEl(doc, "path", { class: "string", d: string }));
  for (let index = 0; index < options.count; index += 1) {
    const t = (index + 0.5 + between(random, -0.18, 0.18)) / options.count;
    const point = stringPoint(options, t, width);
    const flagWidth = between(random, 62, 84) * options.scale;
    const shape = flagShape(random, flagWidth / options.scale);
    const colour = (options.first + index * 5 + Math.floor(random() * 2)) % FLAG_COLOURS;
    const angle = between(random, -3.2, 3.2);
    const flag = svgEl(
      doc,
      "g",
      { class: `flag flag-c${String(colour)}` },
      svgEl(doc, "path", {
        class: "flag-body",
        "fill-rule": "evenodd",
        d: shape.outline + shape.cuts,
      }),
      svgEl(doc, "path", {
        class: "flag-shade",
        "fill-rule": "evenodd",
        d: shape.outline + shape.cuts,
      }),
      svgEl(doc, "path", {
        class: "flag-crease",
        d: `M${round(between(random, -flagWidth / 6, flagWidth / 6))} 3V${round(shape.height - 12)}`,
      }),
      svgEl(doc, "rect", {
        class: "flag-fold",
        x: -flagWidth / options.scale / 2,
        y: 0,
        width: flagWidth / options.scale,
        height: 8,
      }),
    );
    // Per-flag sway: amplitude, duration and phase (CSSOM, so it works under style-src 'self').
    const sway = (value: string, name: string): void => {
      flag.style.setProperty(name, value);
    };
    sway(`${round(between(random, 2, 4))}deg`, "--sway");
    sway(`${round(between(random, 3.4, 6.2))}s`, "--sway-duration");
    sway(`${round(-between(random, 0, 6))}s`, "--sway-delay");
    sway(`${round(between(random, -2.5, 2.5))}deg`, "--sway-skew");
    root.append(
      svgEl(
        doc,
        "g",
        {
          transform: `translate(${round(point.x)} ${round(point.y)}) rotate(${round(angle)}) scale(${round(options.scale)})`,
        },
        svgEl(doc, "circle", { class: "string-knot", cx: 0, cy: 0, r: 2 }),
        flag,
      ),
    );
  }
}

/** Two strings of hand-cut papel picado. The flag cut-outs are flowers and birds, never skulls. */
export function renderPapelPicado(doc: Document, target: SVGSVGElement): void {
  const width = 1200;
  const root = svgEl(doc, "g");
  // The far string first, smaller flags in shadow; the near string in front.
  const far = svgEl(doc, "g", { class: "row-far" });
  papelRow(
    doc,
    far,
    { y0: 74, y1: 62, sag: 22, count: 7, scale: 0.95, seed: 4711, first: 2 },
    width,
  );
  const near = svgEl(doc, "g", { class: "row-near" });
  papelRow(
    doc,
    near,
    { y0: 12, y1: 18, sag: 18, count: 7, scale: 1.35, seed: 1031, first: 0 },
    width,
  );
  root.append(far, near);
  target.replaceChildren(root);
}

/* ------------------------------------------------------------------ marigold arch */

const TONES = ["mg-a", "mg-b", "mg-c"] as const;

function flowerUse(
  doc: Document,
  x: number,
  y: number,
  size: number,
  turn: number,
  tone: number,
): SVGUseElement {
  return svgEl(doc, "use", {
    href: `#${TONES[tone % 3] ?? "mg-a"}`,
    x: round(x - size / 2),
    y: round(y - size / 2),
    width: round(size),
    height: round(size),
    transform: `rotate(${round(turn)} ${round(x)} ${round(y)})`,
  });
}

function leafUse(doc: Document, x: number, y: number, turn: number, size: number): SVGUseElement {
  return svgEl(doc, "use", {
    href: "#leaf",
    x: round(x - size / 6),
    y: round(y - size / 2),
    width: round(size / 3),
    height: round(size),
    transform: `rotate(${round(turn)} ${round(x)} ${round(y)})`,
  });
}

/** The top of the arch: a half ellipse of cempasúchil, two layers deep, a little uneven. */
export function renderArchTop(doc: Document, target: SVGSVGElement): void {
  const random = seeded(2026);
  const cx = 500;
  const cy = 250;
  const rx = 468;
  const ry = 214;
  const leaves = svgEl(doc, "g", { class: "arch-leaves" });
  const back = svgEl(doc, "g", { class: "arch-back" });
  const front = svgEl(doc, "g", { class: "arch-front" });
  const total = 56;
  for (let index = 0; index < total; index += 1) {
    // From the left leg (angle 180) over the top to the right leg (angle 0).
    const t = (index + between(random, -0.3, 0.3)) / (total - 1);
    const angle = Math.PI * (1 - Math.min(1, Math.max(0, t)));
    const lean = between(random, -12, 12);
    const x = cx + Math.cos(angle) * (rx + lean * 0.3);
    const y = cy - Math.sin(angle) * (ry + lean);
    const size = between(random, 54, 92);
    // One side is fuller than the other: more small buds on the right.
    const tone = Math.floor(random() * 3);
    if (random() < 0.5)
      leaves.append(leafUse(doc, x, y, (angle * 180) / Math.PI + between(random, -50, 50), 62));
    (index % 2 === 0 ? back : front).append(flowerUse(doc, x, y, size, random() * 360, tone));
    if (index % 3 === 0) {
      const inner = between(random, 40, 52);
      back.append(
        flowerUse(
          doc,
          cx + Math.cos(angle) * (rx - 38 - random() * 14),
          cy - Math.sin(angle) * (ry - 34 - random() * 12),
          inner * between(random, 0.7, 1),
          random() * 360,
          tone + 1,
        ),
      );
    }
  }
  // A few loose blooms hanging lower on the left, none on the right: not symmetrical.
  for (let index = 0; index < 4; index += 1) {
    front.append(
      flowerUse(
        doc,
        between(random, 18, 70),
        cy - 20 + index * 24,
        between(random, 44, 64),
        random() * 360,
        index,
      ),
    );
  }
  target.replaceChildren(leaves, back, front);
}

/** The strip down each leg of the arch: a tile of flowers repeated downwards. */
export function renderArchLegs(
  doc: Document,
  defs: SVGDefsElement,
  sizes: readonly number[],
): void {
  const random = seeded(88);
  for (const width of sizes) {
    const height = 230;
    const pattern = svgEl(doc, "pattern", {
      id: `leg-${String(width)}`,
      width,
      height,
      patternUnits: "userSpaceOnUse",
    });
    const scale = width / 76;
    const spots = [
      [0.3, 0.07, 66],
      [0.7, 0.2, 54],
      [0.35, 0.33, 72],
      [0.72, 0.46, 60],
      [0.28, 0.59, 58],
      [0.66, 0.71, 70],
      [0.34, 0.86, 62],
      [0.8, 0.96, 50],
    ] as const;
    for (const [fx, fy, size] of spots) {
      const x = fx * width + between(random, -4, 4) * scale;
      const y = fy * height;
      if (random() < 0.5)
        pattern.append(
          leafUse(doc, x + between(random, -10, 10), y + 16, between(random, -60, 60), 50 * scale),
        );
      pattern.append(flowerUse(doc, x, y, size * scale, random() * 360, Math.floor(random() * 3)));
      // Wrap the flowers that cross the tile edge so the repeat has no seam.
      if (y < 40) pattern.append(flowerUse(doc, x, y + height, size * scale, random() * 360, 0));
      if (y > height - 40)
        pattern.append(flowerUse(doc, x, y - height, size * scale, random() * 360, 1));
    }
    defs.append(pattern);
  }
}

/* ------------------------------------------------------------------ emblems */

/** How many small marks an emblem carries: the model's version number, 0 when it has none. */
function versionOf(id: string): number {
  const match = /(\d+)/.exec(id);
  return match === null ? 0 : Math.min(4, Number(match[1]));
}

function petalRing(
  doc: Document,
  count: number,
  length: number,
  width: number,
  className: string,
  inner = 0,
  turn = 0,
): SVGGElement {
  const group = svgEl(doc, "g", { class: className });
  for (let index = 0; index < count; index += 1) {
    const angle = turn + (360 / count) * index;
    group.append(
      svgEl(doc, "path", {
        d: `M0 ${-inner}C${width} ${-inner - length * 0.35} ${width * 0.7} ${-inner - length * 0.8} 0 ${-inner - length}C${-width * 0.7} ${-inner - length * 0.8} ${-width} ${-inner - length * 0.35} 0 ${-inner}Z`,
        transform: `rotate(${round(angle)})`,
      }),
    );
  }
  return group;
}

/**
 * One abstract cut-paper emblem per model family, in place of a portrait: an eight-point star
 * flower for GPT, a rounded marigold-like flower for Gemma (one small cut per version, so the
 * four are told apart), a plain rosette for anything else. Never a person, never a skull.
 */
export function emblemSvg(doc: Document, family: string, id: string): SVGSVGElement {
  const svg = svgEl(doc, "svg", {
    viewBox: "-50 -50 100 100",
    class: `emblem emblem-${family.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    "aria-hidden": "true",
    focusable: "false",
  });
  const version = versionOf(id);
  if (family === "GPT") {
    svg.append(
      petalRing(doc, 8, 44, 9, "emblem-fill"),
      petalRing(doc, 8, 26, 6, "emblem-cut", 3, 22.5),
      svgEl(doc, "circle", { class: "emblem-cut", r: 5 }),
    );
  } else if (family === "Gemma") {
    const marks = svgEl(doc, "g", { class: "emblem-cut" });
    const count = Math.max(1, version);
    for (let index = 0; index < count; index += 1) {
      const x = (index - (count - 1) / 2) * 9;
      marks.append(svgEl(doc, "circle", { cx: round(x), cy: 0, r: 3.1 }));
    }
    svg.append(
      petalRing(doc, 6, 40, 17, "emblem-fill", 4, 0),
      petalRing(doc, 6, 20, 8, "emblem-cut", 6, 30),
      svgEl(doc, "circle", { class: "emblem-fill", r: 13 }),
      marks,
    );
  } else {
    svg.append(
      petalRing(doc, 10, 42, 8, "emblem-fill"),
      svgEl(doc, "circle", { class: "emblem-cut", r: 6 }),
    );
  }
  return svg;
}

/* ------------------------------------------------------------------ candles and offerings */

export interface CandleOptions {
  /** Height of the jar in rem. */
  readonly height: number;
  /** Which glass tint (0-3). */
  readonly tint: number;
  /** Glow radius in rem. */
  readonly glow: number;
  /** Where in the flicker cycle this candle starts, in seconds (negative delay). */
  readonly phase: number;
  /** A candle at a place: unlit until its ancestor speaks. */
  readonly votive?: boolean;
}

/** A veladora: a tall glass jar of wax with a three-layer flame and its glow. */
export function veladora(doc: Document, options: CandleOptions): HTMLSpanElement {
  const candle = htmlEl(doc, "span", `candle tint-${String(options.tint % 4)}`);
  candle.setAttribute("aria-hidden", "true");
  candle.style.setProperty("--h", `${String(options.height)}rem`);
  candle.style.setProperty("--glow", `${String(options.glow)}rem`);
  candle.style.setProperty("--phase", `${String(-options.phase)}s`);
  const flame = htmlEl(doc, "span", "flame");
  flame.append(
    htmlEl(doc, "span", "flame-glow"),
    htmlEl(doc, "span", "flame-outer"),
    htmlEl(doc, "span", "flame-mid"),
    htmlEl(doc, "span", "flame-core"),
  );
  const jar = htmlEl(doc, "span", "jar");
  jar.append(htmlEl(doc, "span", "wax"), htmlEl(doc, "span", "jar-shine"));
  candle.append(flame, jar);
  return candle;
}

function glassOfWater(doc: Document): HTMLSpanElement {
  const glass = htmlEl(doc, "span", "glass-of-water");
  glass.append(htmlEl(doc, "span", "water"), htmlEl(doc, "span", "glass-shine"));
  return glass;
}

function saltBowl(doc: Document): SVGSVGElement {
  return svgEl(
    doc,
    "svg",
    { class: "offering-salt", viewBox: "0 0 60 40", "aria-hidden": "true", focusable: "false" },
    svgEl(doc, "path", { class: "salt-heap", d: "M12 18C16 6 24 2 30 2C37 2 44 8 48 18Z" }),
    svgEl(doc, "path", { class: "clay", d: "M4 17H56C55 30 46 38 30 38C14 38 5 30 4 17Z" }),
    svgEl(doc, "path", { class: "clay-rim", d: "M4 17H56" }),
    svgEl(doc, "path", { class: "clay-band", d: "M10 26C20 30 40 30 50 26" }),
  );
}

function panDeMuerto(doc: Document): SVGSVGElement {
  // A round loaf with the crossed "bones" and the little ball on top, sugar sprinkled over it.
  return svgEl(
    doc,
    "svg",
    { class: "offering-pan", viewBox: "0 0 90 50", "aria-hidden": "true", focusable: "false" },
    svgEl(doc, "path", {
      class: "pan-loaf",
      d: "M4 44C2 22 20 6 45 6C70 6 88 22 86 44C70 49 20 49 4 44Z",
    }),
    svgEl(doc, "path", {
      class: "pan-bone",
      d: "M20 36C28 22 34 14 40 8M70 36C62 22 56 14 50 8M45 44V12M12 36C26 30 62 30 78 36",
    }),
    svgEl(doc, "circle", { class: "pan-ball", cx: 45, cy: 8, r: 5.5 }),
    svgEl(doc, "path", {
      class: "pan-sugar",
      d: "M26 26h2M60 24h2M38 34h2M52 36h2M16 38h2M72 38h2M45 24h2",
    }),
  );
}

/** The copal burner: a clay brazier with an ember and two wisps of smoke. */
function copalBurner(doc: Document): HTMLSpanElement {
  const burner = htmlEl(doc, "span", "copal");
  const wisps = svgEl(
    doc,
    "svg",
    { class: "smoke", viewBox: "0 0 60 120", "aria-hidden": "true", focusable: "false" },
    svgEl(doc, "path", { class: "wisp wisp-1", d: "M26 118C18 96 36 84 28 62C22 46 34 30 30 8" }),
    svgEl(doc, "path", { class: "wisp wisp-2", d: "M36 118C44 100 28 88 38 70C44 56 32 44 38 26" }),
  );
  const bowl = svgEl(
    doc,
    "svg",
    { class: "brazier", viewBox: "0 0 64 40", "aria-hidden": "true", focusable: "false" },
    svgEl(doc, "path", {
      class: "clay",
      d: "M6 10H58C57 24 48 30 38 30V36H44V39H20V36H26V30C16 30 7 24 6 10Z",
    }),
    svgEl(doc, "ellipse", { class: "ember", cx: 32, cy: 10, rx: 22, ry: 4 }),
    svgEl(doc, "path", { class: "copal-lumps", d: "M24 9l3-3 3 2 3-3 4 3 3-1" }),
  );
  burner.append(wisps, bowl);
  return burner;
}

/** The base level: offerings in a row, uneven heights, nothing aligned too neatly. */
export function renderOfferings(doc: Document, target: HTMLElement): void {
  const group = (className: string, ...children: readonly Element[]): HTMLSpanElement => {
    const item = htmlEl(doc, "span", `offering-item ${className}`);
    item.append(...children);
    return item;
  };
  target.replaceChildren(
    group("item-candle-a", veladora(doc, { height: 6.4, tint: 0, glow: 9, phase: 0.4 })),
    group("item-pan", panDeMuerto(doc)),
    group("item-candle-b", veladora(doc, { height: 4.2, tint: 2, glow: 6.5, phase: 2.1 })),
    group("item-water", glassOfWater(doc)),
    group("item-copal", copalBurner(doc)),
    group("item-salt", saltBowl(doc)),
    group("item-candle-c", veladora(doc, { height: 5.2, tint: 1, glow: 8, phase: 1.3 })),
    group("item-candle-d", veladora(doc, { height: 3.1, tint: 3, glow: 5, phase: 3.6 })),
  );
}

/** The candles on the top level, either side of the one who tends the altar. */
export function renderTopCandles(doc: Document, target: HTMLElement): void {
  target.replaceChildren(
    veladora(doc, { height: 5.6, tint: 1, glow: 8, phase: 0.9 }),
    veladora(doc, { height: 3.4, tint: 3, glow: 5.5, phase: 2.6 }),
    veladora(doc, { height: 4.4, tint: 2, glow: 7, phase: 1.7 }),
    veladora(doc, { height: 6.2, tint: 0, glow: 9, phase: 3.3 }),
  );
}

/* ------------------------------------------------------------------ petals and the marigold bed */

/** The path of petals leading to the altar: narrow at the altar, wide near the visitor. */
export function renderPetalPath(doc: Document, target: HTMLElement, count: number): void {
  const random = seeded(909);
  target.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const depth = random();
    // depth 0 is at the altar, 1 at the visitor; the path drifts a little to one side.
    const centre = 50 + Math.sin(depth * 3.1) * 6;
    const spread = 6 + depth * 30;
    const x = centre + (random() + random() - 1) * spread;
    const petal = htmlEl(doc, "span", `petal petal-${String(index % 3)}`);
    petal.style.setProperty("--x", `${round(x)}%`);
    petal.style.setProperty("--y", `${round(depth * 100)}%`);
    petal.style.setProperty("--turn", `${String(Math.round(random() * 360))}deg`);
    petal.style.setProperty("--size", `${round(0.35 + depth * 0.5 + random() * 0.2)}rem`);
    target.append(petal);
  }
}

/** A row of marigold heads along the front of the base level. */
export function renderMarigoldBed(doc: Document, target: HTMLElement): void {
  const random = seeded(515);
  const width = 1000;
  const svg = svgEl(doc, "svg", {
    viewBox: `0 0 ${String(width)} 70`,
    preserveAspectRatio: "xMidYMax slice",
    "aria-hidden": "true",
    focusable: "false",
  });
  for (let x = -10; x < width + 30; x += between(random, 30, 44)) {
    svg.append(
      flowerUse(
        doc,
        x,
        between(random, 30, 52),
        between(random, 46, 66),
        random() * 360,
        Math.floor(random() * 3),
      ),
    );
  }
  target.replaceChildren(svg);
}
