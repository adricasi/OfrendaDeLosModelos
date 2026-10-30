#!/usr/bin/env node
// NFR-008: checks the licences of every package in package-lock.json.
//
// - Production (shipped) packages must be MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC or 0BSD.
// - Dev-only packages may also use MPL-2.0, Python-2.0, CC-BY-4.0, BlueOak-1.0.0 or Unlicense;
//   they are printed as "dev-only, not shipped".
// - Anything else, or a missing licence, fails unless the package is in the allowlist file
//   (tools/licence-allowlist.json) with a reason.
//
// Usage: node tools/check-licences.mjs [--lock package-lock.json] [--allowlist tools/licence-allowlist.json]
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const PRODUCTION_LICENCES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
]);
export const DEV_ONLY_LICENCES = new Set([
  ...PRODUCTION_LICENCES,
  "MPL-2.0",
  "Python-2.0",
  "CC-BY-4.0",
  "BlueOak-1.0.0",
  "Unlicense",
]);

/**
 * Evaluates an SPDX licence expression with a small recursive-descent parser:
 *   or   := and ("OR" and)*        (OR binds looser than AND)
 *   and  := atom ("AND" atom)*
 *   atom := "(" or ")" | id ("WITH" id)?
 * `X WITH Y` is one licence id, so it is allowed only if that exact string is in `allowed`.
 * A malformed expression is never allowed.
 */
export function expressionAllowed(expression, allowed) {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let position = 0;
  const peek = () => tokens[position];
  const isKeyword = (token, word) => token !== undefined && token.toUpperCase() === word;

  function parseOr() {
    let result = parseAnd();
    while (isKeyword(peek(), "OR")) {
      position += 1;
      const right = parseAnd();
      result = result || right;
    }
    return result;
  }
  function parseAnd() {
    let result = parseAtom();
    while (isKeyword(peek(), "AND")) {
      position += 1;
      const right = parseAtom();
      result = result && right;
    }
    return result;
  }
  function parseAtom() {
    const token = peek();
    if (token === undefined) throw new Error("unexpected end");
    position += 1;
    if (token === "(") {
      const inner = parseOr();
      if (peek() !== ")") throw new Error("missing )");
      position += 1;
      return inner;
    }
    const keyword = ["AND", "OR", "WITH", ")"].includes(token.toUpperCase());
    if (keyword) throw new Error(`unexpected ${token}`);
    let id = token;
    if (isKeyword(peek(), "WITH")) {
      position += 1;
      const exception = peek();
      if (exception === undefined || exception === "(" || exception === ")") {
        throw new Error("missing exception");
      }
      position += 1;
      id = `${token} WITH ${exception}`;
    }
    return allowed.has(id);
  }

  try {
    const result = parseOr();
    return position === tokens.length && result;
  } catch {
    return false;
  }
}

/** True when `version` satisfies space-separated comparators such as ">=1.2.0 <2.0.0". */
export function versionInRange(version, range) {
  const parse = (v) =>
    v
      .split("-")[0]
      .split(".")
      .map((n) => Number.parseInt(n, 10));
  const compare = (x, y) => {
    for (let i = 0; i < 3; i += 1) {
      const d = (x[i] ?? 0) - (y[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };
  const have = parse(version);
  return range.split(/\s+/).every((comparator) => {
    const match = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(comparator);
    if (match === null) throw new Error(`unsupported version range: ${range}`);
    const order = compare(have, parse(match[2]));
    switch (match[1] ?? "=") {
      case ">=":
        return order >= 0;
      case "<=":
        return order <= 0;
      case ">":
        return order > 0;
      case "<":
        return order < 0;
      default:
        return order === 0;
    }
  });
}

function waiverFor(entries, name, version) {
  return entries.find(
    (e) =>
      e.name === name &&
      (e.version !== undefined ? e.version === version : versionInRange(version, e.versions)),
  );
}

function licenceOf(entry) {
  const { license } = entry;
  if (typeof license === "string" && license.trim() !== "") return license.trim();
  if (Array.isArray(license) && license.length > 0) {
    // Legacy form: a list of licences means "any of these".
    return license.map((l) => (typeof l === "string" ? l : l?.type)).join(" OR ");
  }
  return null;
}

function nameOf(path) {
  return path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
}

/** Returns { shipped, devOnly, failures } for the parsed lock file and allowlist. */
export function checkLock(lock, allowlist) {
  const shipped = [];
  const devOnly = [];
  const failures = [];
  const waivers = allowlist.packages ?? [];
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path === "" || entry.link === true) continue;
    const name = nameOf(path);
    const licence = licenceOf(entry);
    // Only `dev: true` is dev-only. `devOptional` and `optional` packages can be installed for
    // (and shipped with) production, so they are checked as production.
    const isDev = entry.dev === true;
    const row = { name, version: entry.version ?? "?", licence: licence ?? "(none)" };
    // A waiver covers one version (or a range) of dev-only packages unless it says `"production": true`.
    const found = waiverFor(waivers, name, entry.version ?? "0.0.0");
    const waiver = found !== undefined && (isDev || found.production === true) ? found : undefined;
    const acceptable =
      licence !== null &&
      expressionAllowed(licence, isDev ? DEV_ONLY_LICENCES : PRODUCTION_LICENCES);
    if (!acceptable && waiver === undefined) {
      failures.push({ ...row, scope: isDev ? "dev" : "production" });
      continue;
    }
    (isDev ? devOnly : shipped).push({ ...row, waiver: acceptable ? undefined : waiver.reason });
  }
  return { shipped, devOnly, failures };
}

function parseArgs(argv) {
  const options = { lock: "package-lock.json", allowlist: "tools/licence-allowlist.json" };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag !== "--lock" && flag !== "--allowlist") || value === undefined) {
      throw new Error(`Unknown or incomplete option: ${flag}`);
    }
    options[flag.slice(2)] = value;
  }
  return options;
}

function loadAllowlist(path) {
  if (!existsSync(path)) return { packages: [] };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  for (const entry of parsed.packages ?? []) {
    if (typeof entry.name !== "string" || typeof entry.reason !== "string" || entry.reason === "") {
      throw new Error(`${path}: every allowlist entry needs a name and a reason`);
    }
    if ((entry.version === undefined) === (entry.versions === undefined)) {
      throw new Error(`${path}: ${entry.name} needs exactly one of "version" or "versions"`);
    }
  }
  return parsed;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const lock = JSON.parse(readFileSync(options.lock, "utf8"));
  const { shipped, devOnly, failures } = checkLock(lock, loadAllowlist(options.allowlist));

  console.log(`Shipped (production) packages: ${String(shipped.length)}`);
  for (const p of shipped) {
    console.log(
      `  ${p.name}@${p.version}: ${p.licence}${p.waiver ? ` (allowlisted: ${p.waiver})` : ""}`,
    );
  }
  const byLicence = new Map();
  for (const p of devOnly) byLicence.set(p.licence, (byLicence.get(p.licence) ?? 0) + 1);
  console.log(`Dev-only, not shipped: ${String(devOnly.length)} packages`);
  for (const [licence, count] of [...byLicence].sort()) {
    console.log(`  ${licence}: ${String(count)}`);
  }
  for (const p of devOnly.filter((d) => d.waiver !== undefined)) {
    console.log(`  allowlisted ${p.name}@${p.version} (${p.licence}): ${p.waiver}`);
  }
  if (failures.length > 0) {
    console.error(`\n${String(failures.length)} package(s) with a licence that is not allowed:`);
    for (const f of failures) {
      console.error(`  ${f.name}@${f.version} [${f.scope}]: ${f.licence}`);
    }
    console.error("Replace the package, or add it to tools/licence-allowlist.json with a reason.");
    process.exitCode = 1;
    return;
  }
  console.log("\nLicence check passed.");
}

// Run only when executed directly, so tests and other tools can import the functions.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
