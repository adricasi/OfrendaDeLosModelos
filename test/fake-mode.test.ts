import { build } from "vite";
import { describe, expect, it } from "vitest";

import { fakeModelsRequested } from "../src/fake/bootstrap.js";
import { FAKE_WORKER_MARKER } from "../src/fake/fake-worker.js";

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

describe("the fake model worker is test-only (NFR-002)", () => {
  it("reads ?fake-models from the query string", () => {
    expect(fakeModelsRequested("?fake-models")).toBe(true);
    expect(fakeModelsRequested("?a=1&fake-models&b=2")).toBe(true);
    expect(fakeModelsRequested("")).toBe(false);
  });

  it("is absent from the production build, so ?fake-models is ignored there", async () => {
    const code = await bundledCode("production");
    expect(code.length).toBeGreaterThan(1000);
    expect(code).not.toContain(FAKE_WORKER_MARKER);
    expect(code).not.toContain("fake-models");
    expect(code).not.toContain("fake-delay");
  }, 60_000);

  it("is present in a test-mode build (so the check above can fail)", async () => {
    const code = await bundledCode("test");
    expect(code).toContain(FAKE_WORKER_MARKER);
    expect(code).toContain("fake-models");
  }, 60_000);
});
