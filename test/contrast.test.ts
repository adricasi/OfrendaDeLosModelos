import { describe, expect, it } from "vitest";

import { read } from "./helpers.js";

/**
 * WCAG AA for the candlelit palette (NFR-009): text 4.5:1, large text and UI parts 3:1.
 * Papel picado and marigold fills are decoration only and are not listed here.
 */

type Rgb = readonly [number, number, number];

const css = read("src/styles.css");

function token(name: string): Rgb {
  const value = new RegExp(`--${name}:\\s*#([0-9a-fA-F]{6})`).exec(css)?.[1];
  if (value === undefined) throw new Error(`no --${name} token`);
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as unknown as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

describe("text on the room's surfaces (4.5:1)", () => {
  const surfaces = ["night", "night-soft", "night-raised", "dark-frame"];
  const texts = ["text", "text-muted", "link", "marigold-light"];
  for (const surface of surfaces) {
    for (const text of texts) {
      it(`--${text} on --${surface}`, () => {
        expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("--error on --night and --night-soft", () => {
    expect(contrast("error", "night")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("error", "night-soft")).toBeGreaterThanOrEqual(4.5);
  });

  it("button text --night on --marigold and --marigold-light", () => {
    expect(contrast("night", "marigold")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("night", "marigold-light")).toBeGreaterThanOrEqual(4.5);
  });

  it("calaverita card text --ink on --paper", () => {
    expect(contrast("ink", "paper")).toBeGreaterThanOrEqual(4.5);
  });

  it("skip link text --night on --text", () => {
    expect(contrast("night", "text")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("focus and borders against the surfaces (3:1)", () => {
  for (const surface of ["night", "night-soft", "night-raised"]) {
    it(`the focus outline --marigold-light on --${surface}`, () => {
      expect(contrast("marigold-light", surface)).toBeGreaterThanOrEqual(3);
    });
  }

  it("the text area border --text-muted on --night", () => {
    expect(contrast("text-muted", "night")).toBeGreaterThanOrEqual(3);
  });

  it("the ritual's left border --marigold on --night-soft", () => {
    expect(contrast("marigold", "night-soft")).toBeGreaterThanOrEqual(3);
  });
});
