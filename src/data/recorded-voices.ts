/**
 * Schema and validation for public/data/recorded-voices.json (REQ-005, REQ-013).
 *
 * The file is written by the recording tool (scripts/record-voices.ts) and read by the ritual.
 * `parseRecordedVoices` returns freshly built objects with a fixed key order, so serialising its
 * result is deterministic. Unlike the other data files an empty list is valid: the committed
 * placeholder has no voices until the builder has recorded them.
 */
import { DataValidationError, isHttpsUrl } from "./validate.js";
import type { Licence } from "./validate.js";

const FILE = "recorded-voices.json";

export type VoiceLanguage = "en" | "es";

export const VOICE_LANGUAGES: readonly VoiceLanguage[] = ["en", "es"];

export interface GenerationSettings {
  readonly temperature: number;
  readonly seed: number;
  readonly numPredict: number;
}

export interface RecordingProvenance {
  readonly model: {
    readonly name: string;
    readonly tag: string;
    readonly digest: string;
    readonly licence: Licence;
  };
  readonly settings: GenerationSettings;
  /** UTC instant, ISO 8601 with a trailing Z. */
  readonly recordedAt: string;
  readonly runtime: { readonly name: "ollama"; readonly version: string };
}

export interface RecordedVoice extends RecordingProvenance {
  readonly ancestorId: string;
  readonly questionId: string;
  /** The question text that was asked, so a changed question is re-recorded. */
  readonly questionText: string;
  readonly language: VoiceLanguage;
  /** Exactly what the model wrote (only surrounding whitespace removed). */
  readonly answer: string;
}

/** The medium's words for one offered question (AC-007.5). */
export interface RecordedMedium extends RecordingProvenance {
  readonly questionId: string;
  readonly language: VoiceLanguage;
  readonly answer: string;
  /** `sha256` is the prompt file; `inputSha256` the filled prompt (question and answers). */
  readonly prompt: {
    readonly file: string;
    readonly sha256: string;
    readonly inputSha256: string;
  };
}

export interface RecordedVoicesFile {
  readonly schemaVersion: 1;
  readonly voices: readonly RecordedVoice[];
  readonly medium: readonly RecordedMedium[];
}

export function emptyRecordedVoices(): RecordedVoicesFile {
  return { schemaVersion: 1, voices: [], medium: [] };
}

type Obj = Readonly<Record<string, unknown>>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, problem: string): never {
  throw new DataValidationError(FILE, path, problem);
}

function obj(parent: Obj, key: string, path: string): Obj {
  const v = parent[key];
  if (!isObj(v)) fail(`${path}.${key}`, "must be an object");
  return v;
}

function str(parent: Obj, key: string, path: string): string {
  const v = parent[key];
  if (typeof v !== "string" || v.trim() === "")
    fail(`${path}.${key}`, "must be a non-empty string");
  return v;
}

function num(parent: Obj, key: string, path: string, integer: boolean): number {
  const v = parent[key];
  if (typeof v !== "number" || !Number.isFinite(v) || (integer && !Number.isInteger(v))) {
    fail(`${path}.${key}`, integer ? "must be an integer" : "must be a finite number");
  }
  return v;
}

function language(parent: Obj, path: string): VoiceLanguage {
  const v = parent["language"];
  const match = VOICE_LANGUAGES.find((candidate) => candidate === v);
  if (match === undefined) fail(`${path}.language`, `must be one of ${VOICE_LANGUAGES.join(", ")}`);
  return match;
}

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function utcInstant(parent: Obj, key: string, path: string): string {
  const v = str(parent, key, path);
  const parsed = new Date(v);
  // Round-trip through Date so impossible instants (February 31st, hour 25) are rejected.
  const roundTrips =
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 19) === v.slice(0, 19);
  if (!UTC_INSTANT.test(v) || !roundTrips) {
    fail(`${path}.${key}`, `must be a real UTC instant like 2026-10-30T12:00:00Z, got "${v}"`);
  }
  return v;
}

function httpsUrl(parent: Obj, key: string, path: string): string {
  const v = str(parent, key, path);
  if (!isHttpsUrl(v)) fail(`${path}.${key}`, `must be an https URL, got "${v}"`);
  return v;
}

function provenance(entry: Obj, path: string): RecordingProvenance {
  const model = obj(entry, "model", path);
  const licence = obj(model, "licence", `${path}.model`);
  const digest = str(model, "digest", `${path}.model`);
  if (!/^[0-9a-f]{12,64}$/.test(digest)) {
    fail(`${path}.model.digest`, "must be a lowercase hex digest from the runtime");
  }
  const settings = obj(entry, "settings", path);
  const runtime = obj(entry, "runtime", path);
  if (runtime["name"] !== "ollama") fail(`${path}.runtime.name`, 'must be "ollama"');
  return {
    model: {
      name: str(model, "name", `${path}.model`),
      tag: str(model, "tag", `${path}.model`),
      digest,
      licence: {
        name: str(licence, "name", `${path}.model.licence`),
        url: httpsUrl(licence, "url", `${path}.model.licence`),
      },
    },
    settings: {
      temperature: num(settings, "temperature", `${path}.settings`, false),
      seed: num(settings, "seed", `${path}.settings`, true),
      numPredict: num(settings, "numPredict", `${path}.settings`, true),
    },
    recordedAt: utcInstant(entry, "recordedAt", path),
    runtime: { name: "ollama", version: str(runtime, "version", `${path}.runtime`) },
  };
}

function list(root: Obj, key: string): readonly Obj[] {
  const v = root[key];
  if (!Array.isArray(v)) fail(`.${key}`, "must be an array");
  return v.map((entry: unknown, index: number) => {
    if (!isObj(entry)) fail(`.${key}[${index}]`, "must be an object");
    return entry;
  });
}

function hash(parent: Obj, key: string, path: string): string {
  const v = str(parent, key, path);
  if (!/^[0-9a-f]{64}$/.test(v)) fail(`${path}.${key}`, "must be a sha-256 hex digest");
  return v;
}

function noDuplicate(seen: Set<string>, id: string, path: string): void {
  if (seen.has(id)) fail(path, `is a duplicate: "${id}"`);
  seen.add(id);
}

export function parseRecordedVoices(input: unknown): RecordedVoicesFile {
  if (!isObj(input)) fail("(root)", "must be an object");
  if (input["schemaVersion"] !== 1) fail(".schemaVersion", "must be 1");

  const seenVoices = new Set<string>();
  const voices = list(input, "voices").map((entry, index): RecordedVoice => {
    const path = `.voices[${index}]`;
    const voice = {
      ancestorId: str(entry, "ancestorId", path),
      questionId: str(entry, "questionId", path),
      questionText: str(entry, "questionText", path),
      language: language(entry, path),
      answer: str(entry, "answer", path),
      ...provenance(entry, path),
    };
    noDuplicate(seenVoices, `${voice.ancestorId}/${voice.questionId}/${voice.language}`, path);
    return voice;
  });

  const seenMedium = new Set<string>();
  const medium = list(input, "medium").map((entry, index): RecordedMedium => {
    const path = `.medium[${index}]`;
    const prompt = obj(entry, "prompt", path);
    const sha256 = hash(prompt, "sha256", `${path}.prompt`);
    const inputSha256 = hash(prompt, "inputSha256", `${path}.prompt`);
    const words = {
      questionId: str(entry, "questionId", path),
      language: language(entry, path),
      answer: str(entry, "answer", path),
      ...provenance(entry, path),
      prompt: { file: str(prompt, "file", `${path}.prompt`), sha256, inputSha256 },
    };
    noDuplicate(seenMedium, `${words.questionId}/${words.language}`, path);
    return words;
  });

  return { schemaVersion: 1, voices, medium };
}

/** Stable, pretty JSON with a trailing newline; validates first so a bad file is never written. */
export function serializeRecordedVoices(data: unknown): string {
  return `${JSON.stringify(parseRecordedVoices(data), null, 2)}\n`;
}

/**
 * Every recorded entry must refer to a question and an ancestor that still exist, so the ritual
 * never replays a voice for something the site no longer offers.
 */
export function assertKnownIds(
  file: RecordedVoicesFile,
  known: { readonly ancestorIds: Iterable<string>; readonly questionIds: Iterable<string> },
): void {
  const ancestors = new Set(known.ancestorIds);
  const questions = new Set(known.questionIds);
  file.voices.forEach((voice, index) => {
    if (!ancestors.has(voice.ancestorId)) {
      fail(`.voices[${index}].ancestorId`, `is unknown: "${voice.ancestorId}"`);
    }
    if (!questions.has(voice.questionId)) {
      fail(`.voices[${index}].questionId`, `is unknown: "${voice.questionId}"`);
    }
  });
  file.medium.forEach((words, index) => {
    if (!questions.has(words.questionId)) {
      fail(`.medium[${index}].questionId`, `is unknown: "${words.questionId}"`);
    }
  });
}
