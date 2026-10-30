import { describe, expect, it } from "vitest";

import { BLOCKED_WORDS } from "../src/data/blocked-words.js";
import { read } from "./helpers.js";

describe("blocked words (AC-003.4)", () => {
  it("decodes to a short list of plain lowercase words", () => {
    expect(BLOCKED_WORDS.length).toBeGreaterThan(5);
    expect(BLOCKED_WORDS.length).toBeLessThan(60);
    for (const word of BLOCKED_WORDS) expect(word).toMatch(/^[a-z]{3,20}$/);
    expect(new Set(BLOCKED_WORDS).size).toBe(BLOCKED_WORDS.length);
  });

  it("contains strong profanity", () => {
    expect(BLOCKED_WORDS).toContain("fuck");
    expect(BLOCKED_WORDS).toContain("shit");
  });

  it("is not stored as plain text in the source", () => {
    const source = read("src/data/blocked-words.ts");
    for (const word of BLOCKED_WORDS) expect(source).not.toContain(`"${word}"`);
  });
});
