import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DataValidationError,
  parseAncestors,
  parseCredits,
  parseDarkFrames,
  parseOfferedQuestions,
} from "../src/data/validate.js";

function shipped(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../public/data/${file}`, import.meta.url), "utf8"));
}

const validFrame = {
  id: "x",
  name: "Some Model",
  maker: "Maker",
  event: "Retired",
  date: "2025-07-21",
  yearsOfService: null,
  sourceUrl: "https://example.com/deprecations",
};

const validAncestor = {
  id: "a",
  name: "A",
  family: "F",
  year: 2019,
  size: null,
  kind: "live",
  licence: { name: "MIT", url: "https://opensource.org/license/mit" },
  modelCardUrl: "https://example.com/card",
  repositoryId: null,
  revision: null,
  settings: null,
  verify: "T-001",
};

describe("shipped data files", () => {
  it("validates ancestors.json with five ancestors, none with an invented model id", () => {
    const ancestors = parseAncestors(shipped("ancestors.json"));
    expect(ancestors.map((a) => a.id)).toEqual([
      "gpt-2",
      "gemma-1",
      "gemma-2",
      "gemma-3",
      "gemma-4-e2b",
    ]);
    expect(ancestors.filter((a) => a.kind === "live").map((a) => a.id)).toEqual([
      "gpt-2",
      "gemma-4-e2b",
    ]);
    for (const ancestor of ancestors) {
      expect(ancestor.repositoryId).toBeNull();
      expect(ancestor.revision).toBeNull();
    }
  });

  it("validates offered-questions.json with six bilingual questions", () => {
    expect(parseOfferedQuestions(shipped("offered-questions.json"))).toHaveLength(6);
  });

  it("validates dark-frames.json: every frame has an https source", () => {
    const frames = parseDarkFrames(shipped("dark-frames.json"));
    expect(frames).toHaveLength(4);
    for (const frame of frames) expect(frame.sourceUrl.startsWith("https://")).toBe(true);
  });

  it("validates credits.json with the five cultural sources", () => {
    const credits = parseCredits(shipped("credits.json"));
    expect(credits.sources).toHaveLength(5);
    expect(credits.assets).toMatch(/MIT/);
  });
});

describe("validation failures", () => {
  it("names the file and path of the problem", () => {
    expect(() => parseAncestors({ ancestors: [{ ...validAncestor, year: "2019" }] })).toThrow(
      "ancestors.json: .ancestors[0].year must be an integer",
    );
  });

  it("rejects a non-object root and an empty list", () => {
    expect(() => parseOfferedQuestions(null)).toThrow(DataValidationError);
    expect(() => parseOfferedQuestions({ questions: [] })).toThrow("non-empty array");
  });

  it("rejects an unknown ancestor kind and duplicate ids", () => {
    expect(() => parseAncestors({ ancestors: [{ ...validAncestor, kind: "ghost" }] })).toThrow(
      "must be one of live, recorded",
    );
    expect(() => parseAncestors({ ancestors: [validAncestor, validAncestor] })).toThrow(
      "duplicate",
    );
  });

  it("rejects a question missing its Spanish text", () => {
    expect(() => parseOfferedQuestions({ questions: [{ id: "q", en: "Hello?" }] })).toThrow(
      "es must be a non-empty string",
    );
  });

  it("accepts a valid dark frame", () => {
    expect(parseDarkFrames({ darkFrames: [validFrame] })).toHaveLength(1);
  });

  it("rejects an impossible retirement date", () => {
    for (const date of ["2025-02-31", "2025-13-01", "2025-00-10"]) {
      expect(() => parseDarkFrames({ darkFrames: [{ ...validFrame, date }] })).toThrow(
        "must be a real date",
      );
    }
    expect(parseDarkFrames({ darkFrames: [{ ...validFrame, date: "2024-02-29" }] })).toHaveLength(
      1,
    );
  });

  it("rejects a malformed retirement date", () => {
    expect(() => parseDarkFrames({ darkFrames: [{ ...validFrame, date: "July 2025" }] })).toThrow(
      "must be a real date",
    );
  });
});

describe("https-only links (AC-008.2)", () => {
  const badUrls = [
    ["javascript:", "javascript:alert(1)"],
    ["http:", "http://example.com/source"],
    ["data:", "data:text/html,<p>x</p>"],
    ["not a URL", "not a url"],
  ] as const;

  it.each(badUrls)("rejects a dark frame with a %s source", (_label, url) => {
    expect(() => parseDarkFrames({ darkFrames: [{ ...validFrame, sourceUrl: url }] })).toThrow(
      "must be an https URL",
    );
  });

  it("rejects a dark frame with no source at all", () => {
    const withoutSource: Record<string, unknown> = { ...validFrame };
    delete withoutSource["sourceUrl"];
    expect(() => parseDarkFrames({ darkFrames: [withoutSource] })).toThrow(
      "sourceUrl must be a non-empty string",
    );
  });

  it.each(["", "   "])("rejects a dark frame with an empty source %j", (sourceUrl) => {
    expect(() => parseDarkFrames({ darkFrames: [{ ...validFrame, sourceUrl }] })).toThrow(
      "sourceUrl must be a non-empty string",
    );
  });

  it.each(badUrls)("rejects a credit with a %s link", (_label, url) => {
    const source = { id: "s", title: "T", publisher: "P", url, usedFor: "U" };
    expect(() => parseCredits({ assets: "original", sources: [source] })).toThrow(
      "must be an https URL",
    );
  });

  it.each(badUrls)("rejects an ancestor with a %s model card or licence link", (_label, url) => {
    expect(() => parseAncestors({ ancestors: [{ ...validAncestor, modelCardUrl: url }] })).toThrow(
      "must be an https URL",
    );
    expect(() =>
      parseAncestors({
        ancestors: [{ ...validAncestor, licence: { name: "MIT", url } }],
      }),
    ).toThrow("must be an https URL");
  });
});
