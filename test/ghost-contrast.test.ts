import { describe, expect, it } from "vitest";

import { read } from "./helpers.js";

type Rgb = readonly [number, number, number];

function token(css: string, name: string): Rgb {
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

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** The colour of text drawn at `opacity` over a background. */
function blend(text: Rgb, background: Rgb, opacity: number): Rgb {
  return text.map((c, i) =>
    Math.round(c * opacity + (background[i] ?? 0) * (1 - opacity)),
  ) as unknown as Rgb;
}

describe("ghost word contrast (WCAG AA 4.5:1)", () => {
  const css = read("src/styles.css");
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.]/g, "\\.");
    const match = new RegExp(`^${escaped} \\{([^}]*)\\}`, "m").exec(css);
    if (match === null) throw new Error(`no rule ${selector}`);
    return match[1] ?? "";
  };

  it("the resting ghost words are readable on the answer's background", () => {
    const body = rule(".ghosts");
    expect(body).toMatch(/color:\s*var\(--text-muted\)/);
    const opacity = Number(/opacity:\s*([\d.]+)/.exec(body)?.[1]);
    const background = token(css, "night-soft");
    expect(
      contrast(blend(token(css, "text-muted"), background, opacity), background),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("the probability bubble is readable", () => {
    const body = rule(".ghost-p");
    expect(body).toMatch(/background:\s*var\(--night\)/);
    expect(body).toMatch(/color:\s*var\(--text\)/);
    expect(contrast(token(css, "text"), token(css, "night"))).toBeGreaterThanOrEqual(4.5);
  });

  it("the focus outline is visible against the answer's background (non-text, 3:1)", () => {
    expect(contrast(token(css, "marigold-light"), token(css, "night-soft"))).toBeGreaterThanOrEqual(
      3,
    );
  });
});
