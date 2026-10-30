import { parseRecordedVoices, type RecordedVoicesFile } from "./recorded-voices.js";
import {
  parseAncestors,
  parseCredits,
  parseDarkFrames,
  parseOfferedQuestions,
  type Ancestor,
  type Credits,
  type DarkFrame,
  type OfferedQuestion,
} from "./validate.js";

export interface AltarData {
  readonly ancestors: readonly Ancestor[];
  readonly questions: readonly OfferedQuestion[];
  readonly darkFrames: readonly DarkFrame[];
  readonly credits: Credits;
  readonly recordedVoices: RecordedVoicesFile;
}

export type FetchLike = (url: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

async function fetchJson(fetchFn: FetchLike, baseUrl: string, file: string): Promise<unknown> {
  const response = await fetchFn(`${baseUrl}data/${file}`);
  if (!response.ok) {
    throw new Error(`${file}: could not be loaded (HTTP ${String(response.status)})`);
  }
  return response.json();
}

/** Loads and validates all static data; rejects with a clear message on the first problem. */
export async function loadAltarData(
  baseUrl: string,
  fetchFn: FetchLike = (url) => fetch(url),
): Promise<AltarData> {
  const [ancestors, questions, darkFrames, credits, recordedVoices] = await Promise.all([
    fetchJson(fetchFn, baseUrl, "ancestors.json"),
    fetchJson(fetchFn, baseUrl, "offered-questions.json"),
    fetchJson(fetchFn, baseUrl, "dark-frames.json"),
    fetchJson(fetchFn, baseUrl, "credits.json"),
    fetchJson(fetchFn, baseUrl, "recorded-voices.json"),
  ]);
  return {
    ancestors: parseAncestors(ancestors),
    questions: parseOfferedQuestions(questions),
    darkFrames: parseDarkFrames(darkFrames),
    credits: parseCredits(credits),
    recordedVoices: parseRecordedVoices(recordedVoices),
  };
}
