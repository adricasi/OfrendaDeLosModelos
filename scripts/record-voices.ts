/**
 * `npm run record-voices` — records the middle ancestors' answers through a local Ollama.
 * Usage: npm run record-voices [-- --config path/to/config.json]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  emptyRecordedVoices,
  parseRecordedVoices,
  serializeRecordedVoices,
} from "../src/data/recorded-voices.js";
import { OllamaUnreachableError } from "./ollama.js";
import { parseRecorderConfig, recordVoices } from "./record.js";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const root = process.cwd(); // npm runs scripts from the package root
  const configPath = resolve(
    argValue("--config") ?? resolve(root, "scripts/record-voices.config.json"),
  );
  const readText = (path: string): string | null => {
    const full = resolve(root, path);
    return existsSync(full) ? readFileSync(full, "utf8") : null;
  };

  const config = parseRecorderConfig(JSON.parse(readFileSync(configPath, "utf8")));
  const outputPath = resolve(root, config.outputFile);
  const previousText = readText(config.outputFile);
  const previous =
    previousText === null ? emptyRecordedVoices() : parseRecordedVoices(JSON.parse(previousText));

  const { file, skippedAncestors } = await recordVoices(config, previous, {
    readText,
    log: (message) => console.log(message),
  });
  writeFileSync(outputPath, serializeRecordedVoices(file));
  console.log(
    `Wrote ${file.voices.length} voices and ${file.medium.length} medium entries to ${config.outputFile}.`,
  );
  if (skippedAncestors.length > 0) {
    console.log(`Skipped (not installed): ${skippedAncestors.join(", ")}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    error instanceof OllamaUnreachableError ? message : `record-voices failed: ${message}`,
  );
  process.exitCode = 1;
});
