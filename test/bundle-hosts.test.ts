import { build } from "vite";
import { describe, expect, it } from "vitest";

import { ALLOWED_BUNDLE_HOSTS } from "../vite.config.js";

async function buildWith(extra: string): Promise<void> {
  await build({
    mode: "production",
    logLevel: "silent",
    build: { write: false },
    plugins: [
      {
        name: "inject-url",
        buildStart() {
          this.emitFile({ type: "asset", fileName: "injected.js", source: extra });
        },
      },
    ],
  });
}

describe("the build allows only known hosts in its output (NFR-001)", () => {
  it("allows the model host and nothing like a CDN", () => {
    expect(ALLOWED_BUNDLE_HOSTS).toContain("huggingface.co");
    expect(ALLOWED_BUNDLE_HOSTS.some((host) => /jsdelivr|unpkg|cdnjs|googleapis/.test(host))).toBe(
      false,
    );
  });

  it("passes with an allowed host", async () => {
    await expect(buildWith('fetch("https://huggingface.co/x")')).resolves.toBeUndefined();
  }, 60_000);

  it("fails the build on a host that is not allowed", async () => {
    await expect(buildWith('fetch("https://cdn.jsdelivr.net/npm/x")')).rejects.toThrow(
      /cdn\.jsdelivr\.net/,
    );
  }, 60_000);
});
