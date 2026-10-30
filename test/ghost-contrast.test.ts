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

describe("ghost word contrast (WCAG AA 4.5:1)", () => {
  const css = read("src/styles.css");
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.]/g, "\\.");
    const match = new RegExp(`^${escaped} \\{([^}]*)\\}`, "m").exec(css);
    if (match === null) throw new Error(`no rule ${selector}`);
    return match[1] ?? "";
  };

  it("the resting ghost words are readable on the answer's background, with no opacity trick", () => {
    const body = rule(".ghosts");
    expect(body).toMatch(/color:\s*var\(--ghost\)/);
    expect(body).not.toMatch(/opacity/);
    expect(contrast(token(css, "ghost"), token(css, "night-soft"))).toBeGreaterThanOrEqual(4.5);
  });

  it("ghost words are fainter than the chosen word, and brighter on hover and focus", () => {
    const luminanceOf = (name: string): number => luminance(token(css, name));
    expect(luminanceOf("ghost")).toBeLessThan(luminanceOf("text"));
    expect(luminanceOf("ghost")).toBeLessThan(luminanceOf("text-muted"));
    expect(css).toMatch(/\.token:focus \.ghosts \{\s*color: var\(--text-muted\)/);
  });

  it("ghost text is at least 0.8rem and the probability at least 0.75rem", () => {
    expect(Number(/font-size:\s*([\d.]+)rem/.exec(rule(".ghosts"))?.[1])).toBeGreaterThanOrEqual(
      0.8,
    );
    expect(Number(/font-size:\s*([\d.]+)rem/.exec(rule(".ghost-p"))?.[1])).toBeGreaterThanOrEqual(
      0.75,
    );
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
