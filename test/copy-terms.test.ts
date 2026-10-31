import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("cultural copy (NFR-010)", () => {
  it("uses Día de Muertos in user-facing copy, prompts and the README", () => {
    for (const file of [
      "index.html",
      "README.md",
      "prompts/medium.md",
      "prompts/gemma4-answer.md",
    ]) {
      expect(read(file), file).not.toMatch(/Día de los Muertos/);
    }
    expect(read("index.html")).toMatch(
      /name="description"\s+content="An artistic tribute to the memory of AI models, inspired by the Mexican tradition of Día de Muertos/,
    );
  });

  it("keeps the cultural review pending flag true until a Mexican reviewer approves", () => {
    const credits = JSON.parse(read("public/data/credits.json")) as {
      culturalReviewPending: boolean;
    };
    expect(credits.culturalReviewPending).toBe(true);
  });
});
