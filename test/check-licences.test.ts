import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "tools", "check-licences.mjs");

interface LockPackage {
  version?: string;
  license?: string;
  dev?: boolean;
}

function run(
  packages: Record<string, LockPackage>,
  allowlist?: unknown,
): { status: number | null; out: string; err: string } {
  const dir = mkdtempSync(join(tmpdir(), "licences-"));
  const lock = join(dir, "package-lock.json");
  const list = join(dir, "allowlist.json");
  writeFileSync(lock, JSON.stringify({ packages: { "": { name: "x" }, ...packages } }));
  if (allowlist !== undefined) writeFileSync(list, JSON.stringify(allowlist));
  const result = spawnSync(process.execPath, [SCRIPT, "--lock", lock, "--allowlist", list], {
    encoding: "utf8",
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

describe("tools/check-licences.mjs (NFR-008)", () => {
  it("accepts permissive production licences", () => {
    const result = run({
      "node_modules/a": { version: "1.0.0", license: "MIT" },
      "node_modules/b": { version: "1.0.0", license: "Apache-2.0" },
      "node_modules/c": { version: "1.0.0", license: "BSD-3-Clause" },
      "node_modules/d": { version: "1.0.0", license: "ISC" },
      "node_modules/e": { version: "1.0.0", license: "0BSD" },
      "node_modules/f": { version: "1.0.0", license: "(MIT OR GPL-3.0-only)" },
    });
    expect(result.status).toBe(0);
    expect(result.out).toContain("Shipped (production) packages: 6");
  });

  it("rejects a copyleft or unknown production licence, naming the package", () => {
    const result = run({
      "node_modules/gpl": { version: "2.0.0", license: "GPL-3.0-only" },
      "node_modules/odd": { version: "1.0.0", license: "SEE LICENSE IN LICENSE.md" },
    });
    expect(result.status).toBe(1);
    expect(result.err).toContain("gpl@2.0.0 [production]: GPL-3.0-only");
    expect(result.err).toContain("odd@1.0.0 [production]");
  });

  it("rejects a package with no licence", () => {
    const result = run({ "node_modules/nolicence": { version: "1.0.0" } });
    expect(result.status).toBe(1);
    expect(result.err).toContain("nolicence@1.0.0 [production]: (none)");
  });

  it("allows MPL-2.0 and similar only for dev-only packages and prints them as not shipped", () => {
    const dev = run({ "node_modules/axe": { version: "1.0.0", license: "MPL-2.0", dev: true } });
    expect(dev.status).toBe(0);
    expect(dev.out).toContain("Dev-only, not shipped: 1 packages");
    expect(dev.out).toContain("MPL-2.0: 1");

    const shipped = run({ "node_modules/axe": { version: "1.0.0", license: "MPL-2.0" } });
    expect(shipped.status).toBe(1);
    expect(shipped.err).toContain("axe@1.0.0 [production]: MPL-2.0");
  });

  it("uses the innermost name of nested packages", () => {
    const result = run({
      "node_modules/a/node_modules/lru-cache": { version: "1.0.0", license: "GPL-2.0", dev: true },
    });
    expect(result.err).toContain("lru-cache@1.0.0 [dev]");
  });

  it("accepts an allowlisted dev package, with its reason, but not for production", () => {
    const allowlist = { packages: [{ name: "mdn-data", reason: "CC0 data, dev-only" }] };
    const dev = run(
      { "node_modules/mdn-data": { version: "2.0.0", license: "CC0-1.0", dev: true } },
      allowlist,
    );
    expect(dev.status).toBe(0);
    expect(dev.out).toContain("allowlisted mdn-data@2.0.0 (CC0-1.0): CC0 data, dev-only");

    const shipped = run(
      { "node_modules/mdn-data": { version: "2.0.0", license: "CC0-1.0" } },
      allowlist,
    );
    expect(shipped.status).toBe(1);
  });

  it("requires a reason for every allowlist entry", () => {
    const result = run(
      { "node_modules/a": { version: "1.0.0", license: "MIT" } },
      { packages: [{ name: "a", reason: "" }] },
    );
    expect(result.status).toBe(1);
    expect(result.err).toContain("needs a name and a reason");
  });

  it("passes on this repository's lock file", () => {
    const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Licence check passed.");
  });
});
