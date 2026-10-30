import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url).pathname;

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? sourceFiles(path) : [path];
  });
}

function csp(): Map<string, string> {
  const content = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(
    read("index.html"),
  )?.[1];
  if (content === undefined) throw new Error("index.html has no CSP meta tag");
  return new Map(
    content.split(";").map((part) => {
      const [name = "", ...values] = part.trim().split(/\s+/);
      return [name, values.join(" ")] as const;
    }),
  );
}

describe("Content Security Policy (NFR-001)", () => {
  it("matches design.md", () => {
    const policy = csp();
    expect(policy.get("default-src")).toBe("'self'");
    expect(policy.get("script-src")).toBe("'self' 'wasm-unsafe-eval'");
    expect(policy.get("worker-src")).toBe("'self' blob:");
    expect(policy.get("connect-src")).toBe("'self'");
    expect(policy.get("img-src")).toBe("'self' data: blob:");
    expect(policy.get("style-src")).toBe("'self'");
    expect(policy.get("object-src")).toBe("'none'");
    expect(policy.get("base-uri")).toBe("'self'");
    expect(policy.get("require-trusted-types-for")).toBe("'script'");
  });

  it("is not weakened by unsafe-inline or unsafe-eval", () => {
    const text = [...csp().values()].join(" ");
    expect(text).not.toMatch(/'unsafe-inline'/);
    expect(text).not.toMatch(/'unsafe-eval'/);
  });

  it("index.html has no inline script, inline style or style attribute", () => {
    const html = read("index.html");
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/);
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/\son\w+="/);
  });

  it("source never uses innerHTML or other HTML sinks", () => {
    for (const file of sourceFiles("src")) {
      expect(read(file), file).not.toMatch(
        /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/,
      );
    }
  });
});

describe("reduced motion (AC-001.3)", () => {
  // This is a CSS-text check on purpose: jsdom does not evaluate media queries, so the
  // reduced-motion behaviour cannot be observed in a DOM test.
  it("disables candle and petal animation under prefers-reduced-motion", () => {
    const css = read("src/styles.css");
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\n\})/.exec(css)?.[1];
    expect(block).toBeDefined();
    expect(block).toMatch(/\.flame,\s*\.petal\s*\{\s*animation:\s*none;/);
  });

  it("only animates inside rules the reduced-motion block overrides", () => {
    const css = read("src/styles.css");
    const animated = [...css.matchAll(/([^{}]+)\{[^{}]*animation:\s*(?![\s]|none)[^;]+;/g)].map(
      (m) => (m[1] ?? "").trim(),
    );
    expect(animated.sort()).toEqual([".flame", ".petal"]);
  });

  it("uses no third-party fonts or remote assets (AC-009.4)", () => {
    const css = read("src/styles.css");
    expect(css).not.toMatch(/@font-face|url\(|@import/);
  });
});
