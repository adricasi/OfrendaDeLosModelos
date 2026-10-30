import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  expressionAllowed,
  PRODUCTION_LICENCES,
  versionInRange,
} from "../tools/check-licences.mjs";

const SCRIPT = join(process.cwd(), "tools", "check-licences.mjs");

interface LockPackage {
  version?: string;
  license?: string;
  dev?: boolean;
  devOptional?: boolean;
  optional?: boolean;
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
    const allowlist = {
      packages: [{ name: "mdn-data", version: "2.0.0", reason: "CC0 data, dev-only" }],
    };
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

  it("does not let a waiver cover other versions", () => {
    const allowlist = {
      packages: [{ name: "pkg", version: "1.0.0", reason: "reviewed 1.0.0 only" }],
    };
    const other = run(
      { "node_modules/pkg": { version: "1.0.1", license: "CC0-1.0", dev: true } },
      allowlist,
    );
    expect(other.status).toBe(1);
    const ranged = {
      packages: [{ name: "pkg", versions: ">=1.0.0 <2.0.0", reason: "reviewed 1.x" }],
    };
    expect(
      run({ "node_modules/pkg": { version: "1.5.0", license: "CC0-1.0", dev: true } }, ranged)
        .status,
    ).toBe(0);
    expect(
      run({ "node_modules/pkg": { version: "2.0.0", license: "CC0-1.0", dev: true } }, ranged)
        .status,
    ).toBe(1);
  });

  it("requires exactly one of version or versions in an allowlist entry", () => {
    const result = run(
      { "node_modules/a": { version: "1.0.0", license: "MIT" } },
      { packages: [{ name: "a", reason: "r" }] },
    );
    expect(result.status).toBe(1);
    expect(result.err).toContain('exactly one of "version" or "versions"');
  });

  it("checks devOptional and optional packages as production", () => {
    const devOptional = run({
      "node_modules/o": { version: "1.0.0", license: "MPL-2.0", devOptional: true },
    });
    expect(devOptional.status).toBe(1);
    expect(devOptional.err).toContain("o@1.0.0 [production]");
    const optional = run({
      "node_modules/p": { version: "1.0.0", license: "GPL-3.0-only", optional: true },
    });
    expect(optional.status).toBe(1);
    const fine = run({ "node_modules/q": { version: "1.0.0", license: "MIT", optional: true } });
    expect(fine.status).toBe(0);
    expect(fine.out).toContain("Shipped (production) packages: 1");
  });

  it("requires a reason for every allowlist entry", () => {
    const result = run(
      { "node_modules/a": { version: "1.0.0", license: "MIT" } },
      { packages: [{ name: "a", version: "1.0.0", reason: "" }] },
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

describe("expressionAllowed", () => {
  const ok = (expression: string): boolean => expressionAllowed(expression, PRODUCTION_LICENCES);

  it("handles AND, OR and parentheses with the right precedence", () => {
    expect(ok("MIT")).toBe(true);
    expect(ok("(MIT OR Apache-2.0) AND GPL-3.0")).toBe(false);
    expect(ok("(MIT AND GPL-3.0) OR Apache-2.0")).toBe(true);
    expect(ok("MIT AND (Apache-2.0 OR GPL-3.0)")).toBe(true);
    expect(ok("GPL-3.0 OR LGPL-2.1")).toBe(false);
    expect(ok("MIT OR GPL-3.0 AND LGPL-2.1")).toBe(true);
    expect(ok("GPL-3.0 AND LGPL-2.1 OR MIT")).toBe(true);
    expect(ok("MIT AND GPL-3.0 OR LGPL-2.1")).toBe(false);
  });

  it("treats WITH exceptions as part of the licence id", () => {
    expect(ok("Apache-2.0 WITH LLVM-exception")).toBe(false);
    expect(
      expressionAllowed(
        "Apache-2.0 WITH LLVM-exception",
        new Set(["Apache-2.0 WITH LLVM-exception"]),
      ),
    ).toBe(true);
  });

  it("rejects malformed expressions", () => {
    for (const bad of [
      "",
      "MIT AND",
      "OR MIT",
      "(MIT",
      "MIT)",
      "MIT Apache-2.0",
      "()",
      "MIT WITH",
      "AND",
    ]) {
      expect(ok(bad), bad).toBe(false);
    }
  });
});

describe("versionInRange", () => {
  it("evaluates comparators", () => {
    expect(versionInRange("1.2.3", ">=1.0.0 <2.0.0")).toBe(true);
    expect(versionInRange("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
    expect(versionInRange("1.2.3", "1.2.3")).toBe(true);
  });
});
