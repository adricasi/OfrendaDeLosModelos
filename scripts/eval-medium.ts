/**
 * `npm run eval:medium` — checks the recorded medium outputs automatically (valid JSON, four
 * lines, language, R1/R2 patterns) and prints a table. A person still reads the words.
 * Usage: npm run eval:medium [-- path/to/recorded-voices.json]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { checkMediumEntry, formatTable, summarise } from "../src/medium/check.js";
import { parseRecordedVoices } from "../src/data/recorded-voices.js";

const REQUIRED_USABLE = 4;

function main(): void {
  const file = resolve(process.cwd(), process.argv[2] ?? "public/data/recorded-voices.json");
  const recorded = parseRecordedVoices(JSON.parse(readFileSync(file, "utf8")));
  if (recorded.medium.length === 0) {
    console.log(`No medium entries in ${file} yet: run npm run record-voices first.`);
    process.exitCode = 1;
    return;
  }
  const checks = recorded.medium.map((entry) => checkMediumEntry(entry));
  console.log(formatTable(checks));
  const summary = summarise(checks);
  console.log("");
  for (const s of summary.byLanguage) {
    console.log(
      `${s.language}: ${String(s.usable)} of ${String(s.total)} usable (need at least ${String(REQUIRED_USABLE)})`,
    );
  }
  console.log(
    `R1/R2: ${String(summary.breaking)} entries with known hits (need 0). "None known" is not "none": a person must still read it.`,
  );
  console.log("Note the verdict in progress.md.");
  const short = summary.byLanguage.some((s) => s.usable < REQUIRED_USABLE);
  if (summary.breaking > 0 || short) process.exitCode = 1;
}

main();
