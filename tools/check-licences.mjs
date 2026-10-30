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
 * Evaluates a (simple) SPDX expression: `OR` needs one acceptable alternative, `AND` needs all
 * its terms acceptable. Parentheses are flattened, which is enough for the licences npm reports.
 */
export function expressionAllowed(expression, allowed) {
  const alternatives = expression.replaceAll(/[()]/g, " ").split(/\s+OR\s+/i);
  return alternatives.some((alternative) =>
    alternative
      .split(/\s+AND\s+/i)
      .map((term) => term.trim())
      .every((term) => term !== "" && allowed.has(term)),
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
  const allowed = new Map((allowlist.packages ?? []).map((p) => [p.name, p]));
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path === "" || entry.link === true) continue;
    const name = nameOf(path);
    const licence = licenceOf(entry);
    // `dev` and `devOptional` packages never reach the production bundle.
    const isDev = entry.dev === true || entry.devOptional === true;
    const row = { name, version: entry.version ?? "?", licence: licence ?? "(none)" };
    // A waiver covers dev-only packages unless the entry says `"production": true`.
    const found = allowed.get(name);
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
if (
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
