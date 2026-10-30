/**
 * The recording run (REQ-013): ask each configured ancestor each offered question through a
 * local Ollama, optionally record the medium's words, and return the validated file content.
 * Pure of file access except through the injected `readFile`, so tests can drive it.
 */
import { createHash } from "node:crypto";

import {
  VOICE_LANGUAGES,
  assertKnownIds,
  parseRecordedVoices,
} from "../src/data/recorded-voices.js";
import type {
  RecordedMedium,
  RecordedVoice,
  RecordedVoicesFile,
  RecordingProvenance,
  VoiceLanguage,
} from "../src/data/recorded-voices.js";
import { DataValidationError, isHttpsUrl, parseOfferedQuestions } from "../src/data/validate.js";
import type { Licence, OfferedQuestion } from "../src/data/validate.js";
import { DEFAULT_TIMEOUTS, OllamaClient, assertLoopbackUrl, normalizeTag } from "./ollama.js";
import type { FetchLike, Timeouts } from "./ollama.js";

export interface AncestorConfig {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  /** False until the builder has confirmed the tag exists in the Ollama library. */
  readonly verified: boolean;
  readonly licence: Licence;
}

export interface RecorderConfig {
  readonly ollamaBaseUrl: string;
  readonly offeredQuestionsFile: string;
  readonly outputFile: string;
  readonly generation: {
    readonly temperature: number;
    readonly seed: number;
    readonly numPredict: number;
  };
  readonly timeouts: Timeouts;
  readonly ancestors: readonly AncestorConfig[];
  readonly medium: {
    readonly enabled: boolean;
    readonly ancestorId: string;
    readonly promptFile: string;
  };
}

export interface RecorderDeps {
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  /** Returns the file text, or null when the file does not exist. */
  readonly readText: (path: string) => string | null;
  readonly log?: (message: string) => void;
  readonly timeouts?: Timeouts;
  /** Tags marked "verified": false are refused unless the builder passes --allow-unverified. */
  readonly allowUnverified?: boolean;
}

export interface RecordResult {
  readonly file: RecordedVoicesFile;
  readonly skippedAncestors: readonly string[];
  /** Things that failed mid-run ("gemma-2: reason", "medium: reason"); earlier data was kept. */
  readonly failures: readonly string[];
}

type Obj = Readonly<Record<string, unknown>>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configFail(path: string, problem: string): never {
  throw new DataValidationError("record-voices.config.json", path, problem);
}

function cStr(parent: Obj, key: string, path: string): string {
  const v = parent[key];
  if (typeof v !== "string" || v.trim() === "")
    configFail(`${path}.${key}`, "must be a non-empty string");
  return v;
}

function cInt(parent: Obj, key: string, path: string): number {
  const v = parent[key];
  if (typeof v !== "number" || !Number.isInteger(v))
    configFail(`${path}.${key}`, "must be an integer");
  return v;
}

function cObj(parent: Obj, key: string, path: string): Obj {
  const v = parent[key];
  if (!isObj(v)) configFail(`${path}.${key}`, "must be an object");
  return v;
}

function parseTimeouts(raw: unknown): Timeouts {
  if (raw === undefined) return DEFAULT_TIMEOUTS;
  if (!isObj(raw)) configFail(".timeoutSeconds", "must be an object");
  const seconds = (key: string, fallback: number): number => {
    const v = raw[key];
    if (v === undefined) return fallback / 1000;
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      configFail(`.timeoutSeconds.${key}`, "must be a positive number");
    }
    return v;
  };
  return {
    generateMs: seconds("generate", DEFAULT_TIMEOUTS.generateMs) * 1000,
    quickMs: seconds("quick", DEFAULT_TIMEOUTS.quickMs) * 1000,
  };
}

export function parseRecorderConfig(input: unknown): RecorderConfig {
  if (!isObj(input)) configFail("(root)", "must be an object");
  const generation = cObj(input, "generation", "");
  const temperature = generation["temperature"];
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) {
    configFail(".generation.temperature", "must be a number");
  }
  const medium = cObj(input, "medium", "");
  if (typeof medium["enabled"] !== "boolean")
    configFail(".medium.enabled", "must be true or false");
  const rawAncestors = input["ancestors"];
  if (!Array.isArray(rawAncestors) || rawAncestors.length === 0) {
    configFail(".ancestors", "must be a non-empty array");
  }
  const ancestors = rawAncestors.map((entry: unknown, index: number): AncestorConfig => {
    const path = `.ancestors[${index}]`;
    if (!isObj(entry)) configFail(path, "must be an object");
    const licence = cObj(entry, "licence", path);
    const licenceUrl = cStr(licence, "url", `${path}.licence`);
    if (!isHttpsUrl(licenceUrl)) configFail(`${path}.licence.url`, "must be an https URL");
    if (typeof entry["verified"] !== "boolean")
      configFail(`${path}.verified`, "must be true or false");
    return {
      id: cStr(entry, "id", path),
      name: cStr(entry, "name", path),
      tag: cStr(entry, "tag", path),
      verified: entry["verified"],
      licence: { name: cStr(licence, "name", `${path}.licence`), url: licenceUrl },
    };
  });
  const ids = new Set(ancestors.map((a) => a.id));
  if (ids.size !== ancestors.length) configFail(".ancestors", "has a duplicate id");
  const mediumAncestorId = cStr(medium, "ancestorId", ".medium");
  if (!ids.has(mediumAncestorId)) configFail(".medium.ancestorId", "must be one of the ancestors");
  return {
    ollamaBaseUrl: assertLoopbackUrl(cStr(input, "ollamaBaseUrl", "")).origin,
    offeredQuestionsFile: cStr(input, "offeredQuestionsFile", ""),
    outputFile: cStr(input, "outputFile", ""),
    generation: {
      temperature,
      seed: cInt(generation, "seed", ".generation"),
      numPredict: cInt(generation, "numPredict", ".generation"),
    },
    timeouts: parseTimeouts(input["timeoutSeconds"]),
    ancestors,
    medium: {
      enabled: medium["enabled"],
      ancestorId: mediumAncestorId,
      promptFile: cStr(medium, "promptFile", ".medium"),
    },
  };
}

function questionText(question: OfferedQuestion, language: VoiceLanguage): string {
  return question[language];
}

/** The medium prompt is a text file with {{question}} and {{answers}} placeholders. */
export function fillMediumPrompt(template: string, question: string, answers: string): string {
  return template
    .replaceAll("{{question}}", () => question)
    .replaceAll("{{answers}}", () => answers);
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function provenance(
  ancestor: AncestorConfig,
  digest: string,
  config: RecorderConfig,
  recordedAt: string,
  version: string,
): RecordingProvenance {
  return {
    model: { name: ancestor.name, tag: ancestor.tag, digest, licence: ancestor.licence },
    settings: { ...config.generation },
    recordedAt,
    runtime: { name: "ollama", version },
  };
}

/** An earlier entry is reusable when the same model (digest) and settings produced it. */
function sameRecording(
  earlier: RecordingProvenance,
  current: Pick<RecordingProvenance, "model" | "settings">,
): boolean {
  return (
    JSON.stringify(earlier.model) === JSON.stringify(current.model) &&
    JSON.stringify(earlier.settings) === JSON.stringify(current.settings)
  );
}

const key = (ancestorId: string, questionId: string, language: string): string =>
  `${ancestorId}/${questionId}/${language}`;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function recordVoices(
  config: RecorderConfig,
  previous: RecordedVoicesFile,
  deps: RecorderDeps,
): Promise<RecordResult> {
  const log = deps.log ?? (() => undefined);
  const runAt = (deps.now ?? (() => new Date()))().toISOString(); // one timestamp per run
  const client = new OllamaClient(
    config.ollamaBaseUrl,
    deps.fetch,
    deps.timeouts ?? config.timeouts,
  );

  const unverified = config.ancestors.filter((a) => !a.verified);
  if (unverified.length > 0 && deps.allowUnverified !== true) {
    throw new Error(
      `Unverified Ollama tags: ${unverified.map((a) => a.tag).join(", ")}. Check each exists in the ` +
        'Ollama library and set "verified": true in the config, or pass --allow-unverified.',
    );
  }

  const questionsText = deps.readText(config.offeredQuestionsFile);
  if (questionsText === null) throw new Error(`Cannot read ${config.offeredQuestionsFile}`);
  const questions = parseOfferedQuestions(JSON.parse(questionsText));
  const known = {
    ancestorIds: config.ancestors.map((a) => a.id),
    questionIds: questions.map((q) => q.id),
  };

  // Fails with a clear message when Ollama is not running at all.
  const version = await client.version();
  const digests = await client.digests();

  // Earlier entries for ancestors or questions that no longer exist are dropped.
  const knownAncestors = new Set(known.ancestorIds);
  const knownQuestions = new Set(known.questionIds);
  const earlier = new Map<string, RecordedVoice>();
  for (const voice of previous.voices) {
    if (knownAncestors.has(voice.ancestorId) && knownQuestions.has(voice.questionId)) {
      earlier.set(key(voice.ancestorId, voice.questionId, voice.language), voice);
    } else {
      log(`DROP earlier voice ${voice.ancestorId} / ${voice.questionId}: no longer configured.`);
    }
  }

  const voices = new Map<string, RecordedVoice>(earlier);
  const skipped: string[] = [];
  const failures: string[] = [];

  for (const ancestor of config.ancestors) {
    const digest = digests.get(normalizeTag(ancestor.tag));
    if (digest === undefined) {
      skipped.push(ancestor.id);
      log(
        `SKIP ${ancestor.name}: model "${ancestor.tag}" is not installed. Run "ollama pull ${ancestor.tag}" to record it.`,
      );
      continue;
    }
    const fresh = new Map<string, RecordedVoice>();
    try {
      for (const question of questions) {
        for (const language of VOICE_LANGUAGES) {
          const id = key(ancestor.id, question.id, language);
          const text = questionText(question, language);
          const stamp = provenance(ancestor, digest, config, runAt, version);
          const old = earlier.get(id);
          if (old !== undefined && old.questionText === text && sameRecording(old, stamp)) {
            fresh.set(id, old);
            log(`KEEP ${ancestor.name} / ${question.id} / ${language} (unchanged)`);
            continue;
          }
          const answer = (await client.generate(ancestor.tag, text, config.generation)).trim();
          if (answer === "") {
            log(`WARN ${ancestor.name} gave an empty answer to "${question.id}" (${language}).`);
            continue;
          }
          fresh.set(id, {
            ancestorId: ancestor.id,
            questionId: question.id,
            questionText: text,
            language,
            answer,
            ...stamp,
          });
          log(`OK   ${ancestor.name} / ${question.id} / ${language}`);
        }
      }
    } catch (error) {
      failures.push(`${ancestor.id}: ${describe(error)}`);
      log(`FAIL ${ancestor.name}: ${describe(error)}. Its earlier recordings are kept.`);
      continue;
    }
    for (const [id, voice] of [...voices]) {
      if (voice.ancestorId === ancestor.id) voices.delete(id);
    }
    for (const [id, voice] of fresh) voices.set(id, voice);
  }

  const order = new Map(config.ancestors.map((a, index) => [a.id, index]));
  const questionOrder = new Map(questions.map((q, index) => [q.id, index]));
  const languageOrder = new Map(VOICE_LANGUAGES.map((l, index) => [l, index]));
  const allVoices = [...voices.values()].sort(
    (a, b) =>
      (order.get(a.ancestorId) ?? 99) - (order.get(b.ancestorId) ?? 99) ||
      (questionOrder.get(a.questionId) ?? 99) - (questionOrder.get(b.questionId) ?? 99) ||
      (languageOrder.get(a.language) ?? 0) - (languageOrder.get(b.language) ?? 0),
  );

  let medium: readonly RecordedMedium[] = previous.medium.filter((m) =>
    knownQuestions.has(m.questionId),
  );
  if (config.medium.enabled) {
    try {
      medium = await recordMedium(config, questions, allVoices, medium, digests, version, {
        client,
        deps,
        runAt,
      });
    } catch (error) {
      failures.push(`medium: ${describe(error)}`);
      log(`FAIL medium: ${describe(error)}. Earlier medium words are kept.`);
    }
  } else {
    log(
      "Medium phase disabled (medium.enabled is false in the config); keeping earlier medium words.",
    );
  }

  const file = parseRecordedVoices({ schemaVersion: 1, voices: allVoices, medium });
  assertKnownIds(file, known);
  return { file, skippedAncestors: skipped, failures };
}

async function recordMedium(
  config: RecorderConfig,
  questions: readonly OfferedQuestion[],
  voices: readonly RecordedVoice[],
  earlier: readonly RecordedMedium[],
  digests: ReadonlyMap<string, string>,
  version: string,
  run: { client: OllamaClient; deps: RecorderDeps; runAt: string },
): Promise<readonly RecordedMedium[]> {
  const log = run.deps.log ?? (() => undefined);
  const template = run.deps.readText(config.medium.promptFile);
  if (template === null) {
    log(
      `SKIP medium: prompt file ${config.medium.promptFile} does not exist yet (it comes with T-006).`,
    );
    return earlier;
  }
  const ancestor = config.ancestors.find((a) => a.id === config.medium.ancestorId);
  const digest = ancestor === undefined ? undefined : digests.get(normalizeTag(ancestor.tag));
  if (ancestor === undefined || digest === undefined) {
    log(`SKIP medium: model for "${config.medium.ancestorId}" is not installed.`);
    return earlier;
  }
  const promptHash = sha256(template);
  const words: RecordedMedium[] = [];
  for (const question of questions) {
    for (const language of VOICE_LANGUAGES) {
      // The medium sees the recorded answers; GPT-2 answers live in the browser and is not here.
      const answers = voices
        .filter((v) => v.questionId === question.id && v.language === language)
        .map((v) => `${v.model.name}: ${v.answer}`)
        .join("\n");
      const prompt = fillMediumPrompt(template, questionText(question, language), answers);
      const stamp = provenance(ancestor, digest, config, run.runAt, version);
      const promptInfo = {
        file: config.medium.promptFile,
        sha256: promptHash,
        inputSha256: sha256(prompt),
      };
      const old = earlier.find((m) => m.questionId === question.id && m.language === language);
      if (
        old !== undefined &&
        sameRecording(old, stamp) &&
        JSON.stringify(old.prompt) === JSON.stringify(promptInfo)
      ) {
        words.push(old);
        log(`KEEP medium / ${question.id} / ${language} (unchanged)`);
        continue;
      }
      const answer = (await run.client.generate(ancestor.tag, prompt, config.generation)).trim();
      if (answer === "") {
        log(`WARN medium gave empty words for "${question.id}" (${language}).`);
        continue;
      }
      words.push({ questionId: question.id, language, answer, ...stamp, prompt: promptInfo });
      log(`OK   medium / ${question.id} / ${language}`);
    }
  }
  return words;
}
