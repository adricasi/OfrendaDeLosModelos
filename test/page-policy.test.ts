import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKER_POLICY_NAME } from "../src/worker/trusted-worker.js";

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
    expect(policy.get("worker-src")).toBe("'self'");
    expect(policy.get("connect-src")).toBe("'self' https://huggingface.co");
    expect(policy.get("img-src")).toBe("'self' data: blob:");
    expect(policy.get("style-src")).toBe("'self'");
    expect(policy.get("object-src")).toBe("'none'");
    expect(policy.get("base-uri")).toBe("'self'");
    expect(policy.get("require-trusted-types-for")).toBe("'script'");
    // Only the worker policy of src/worker/trusted-worker.ts may exist.
    expect(policy.get("trusted-types")).toBe(WORKER_POLICY_NAME);
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

const STYLESHEETS = ["src/styles.css", "src/altar-art.css"];

describe("reduced motion (AC-001.3)", () => {
  // This is a CSS-text check on purpose: jsdom does not evaluate media queries, so the
  // reduced-motion behaviour cannot be observed in a DOM test.
  it("switches every animation and transition off under prefers-reduced-motion", () => {
    const css = read("src/styles.css");
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\n\})/.exec(css)?.[1];
    expect(block).toBeDefined();
    expect(block).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{/);
    expect(block).toMatch(/animation:\s*none\s*!important;/);
    expect(block).toMatch(/transition:\s*none\s*!important;/);
  });

  it("has no second reduced-motion rule that could undo the first", () => {
    for (const file of STYLESHEETS) {
      const blocks = read(file).match(/prefers-reduced-motion/g) ?? [];
      expect(blocks.length, file).toBe(file === "src/styles.css" ? 1 : 0);
    }
  });

  it("the scripted motion checks the preference and listens for changes", () => {
    const motion = read("src/ui/motion.ts");
    expect(motion).toMatch(/prefers-reduced-motion: reduce/);
    expect(motion).toMatch(/addEventListener\("change"/);
    expect(motion).toMatch(/visibilitychange/);
  });
});

describe("assets (AC-009.4, NFR-001)", () => {
  it("the CSP allows fonts from the site only", () => {
    expect(csp().get("font-src")).toBe("'self'");
  });

  it("styles load only the two self-hosted fonts and inline SVG grain: no remote URL", () => {
    for (const file of STYLESHEETS) {
      const css = read(file);
      // The SVG namespace inside a data: URI is an identifier, never fetched.
      const withoutDataUris = css.replace(/url\("data:[^"]*"\)/g, 'url("data:")');
      expect(withoutDataUris, file).not.toMatch(/@import|https?:\/\//);
      const urls = [...withoutDataUris.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1] ?? "");
      for (const url of urls) {
        expect(url, file).toMatch(/^(\/fonts\/[A-Za-z]+-latin\.woff2|data:$|#)/);
      }
    }
  });

  it("ships at most three font files, each with its licence", () => {
    const files = readdirSync(join(root, "public/fonts"));
    expect(files.filter((f) => f.endsWith(".woff2")).length).toBeLessThanOrEqual(3);
    expect(files).toContain("OFL-Gloock.txt");
    expect(files).toContain("OFL-BricolageGrotesque.txt");
    expect(files).toContain("README.md");
  });
});
