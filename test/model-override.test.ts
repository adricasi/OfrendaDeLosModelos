import { build } from "vite";
import { describe, expect, it } from "vitest";

import { parseAncestors, type Ancestor } from "../src/data/validate.js";
import {
  applyModelOverrides,
  MODEL_OVERRIDE_MARKER,
  overrideParameter,
  parseModelOverride,
} from "../src/dev/model-override.js";
import { read } from "./helpers.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";

function ancestors(): Ancestor[] {
  return parseAncestors(JSON.parse(read("public/data/ancestors.json")));
}

interface Chunk {
  type: string;
  code?: string;
}

async function bundledCode(mode: string): Promise<string> {
  const result = await build({ mode, logLevel: "silent", build: { write: false } });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) =>
    "output" in r ? (r.output as Chunk[]) : [],
  );
  return outputs.map((o) => o.code ?? "").join("\n");
}

describe("the development model override (?model-gpt2=<id>@<rev>)", () => {
  it("names the parameter after the ancestor", () => {
    expect(overrideParameter("gpt-2")).toBe("model-gpt2");
  });

  it("parses a repository and a full commit hash", () => {
    expect(parseModelOverride(`?model-gpt2=Xenova/gpt2@${SHA}`, "gpt-2")).toEqual({
      repositoryId: "Xenova/gpt2",
      revision: SHA,
    });
  });

  it.each([
    "",
    "?other=1",
    "?model-gpt2=Xenova/gpt2",
    "?model-gpt2=Xenova/gpt2@main",
    `?model-gpt2=https://evil.example/x@${SHA}`,
    `?model-gpt2=../x@${SHA}`,
  ])("ignores %s", (search) => {
    expect(parseModelOverride(search, "gpt-2")).toBeNull();
  });

  it("applies only to the ancestor it names and leaves the data untouched", () => {
    const original = ancestors();
    const result = applyModelOverrides(original, `?model-gpt2=Xenova/gpt2@${SHA}`);
    expect(result.find((a) => a.id === "gpt-2")).toMatchObject({
      repositoryId: "Xenova/gpt2",
      revision: SHA,
    });
    expect(result.filter((a) => a.repositoryId !== null)).toHaveLength(1);
    expect(original.every((a) => a.repositoryId === null)).toBe(true);
  });

  it("ships with GPT-2 unpinned until T-001 supplies the repository and revision", () => {
    const gpt2 = ancestors().find((a) => a.id === "gpt-2");
    expect(gpt2).toMatchObject({ repositoryId: null, revision: null, verify: "T-001" });
  });
});

describe("the production build ignores development overrides", () => {
  it("contains neither the override code nor its parameter name", async () => {
    const code = await bundledCode("production");
    expect(code.length).toBeGreaterThan(1000);
    expect(code).not.toContain("model-gpt2");
    expect(code).not.toContain("model-gemma4");
    expect(code).not.toContain(MODEL_OVERRIDE_MARKER);
  }, 60_000);

  it('a test-mode build ignores it too (only mode "development" has it)', async () => {
    expect(await bundledCode("test")).not.toContain(MODEL_OVERRIDE_MARKER);
  }, 60_000);

  it("is present in a development-mode build (so the checks above can fail)", async () => {
    const code = await bundledCode("development");
    expect(code).toContain(MODEL_OVERRIDE_MARKER);
  }, 60_000);
});
