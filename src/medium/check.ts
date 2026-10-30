/**
 * Automatic checks of the medium's recorded output (`npm run eval:medium`, NFR-010, AC-007.3).
 * They are heuristics that catch format and rule breaks; a person still reads the words
 * (the founder notes that in progress.md).
 */
import { CALAVERITA_LINES, parseMedium } from "./parse.js";

export type CheckLanguage = "en" | "es";

export interface MediumCheck {
  readonly questionId: string;
  readonly language: CheckLanguage;
  readonly schemaValid: boolean;
  readonly schemaProblem: string | null;
  /** Every calaverita has exactly four lines. */
  readonly fourLines: boolean;
  readonly languageMatches: boolean;
  /** R1: mocking words found. */
  readonly r1Hits: readonly string[];
  /** R2: signs of speaking as a real person. */
  readonly r2Hits: readonly string[];
  /** Usable: valid, four lines, right language, no R1/R2 hit. */
  readonly usable: boolean;
}

const SPANISH_WORDS = new Set(
  "el la los las un una unos unas de del y o que en es son por para con no se su sus al lo como más pero mi tu te me nos hay fue ser está están cuando donde qué quién cómo sin sobre entre muy también todo todos cada hoy noche".split(
    " ",
  ),
);
const ENGLISH_WORDS = new Set(
  "the a an and or of to in is are was were it its that this with for not as but be by on at from they their we you your my our i he she his her there when what who how all each tonight have has had will would".split(
    " ",
  ),
);

/** Spanish stopwords and accents against English stopwords; the larger score wins. */
export function detectLanguage(text: string): CheckLanguage | null {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  let es = (text.match(/[áéíóúñ¿¡ü]/gi) ?? []).length;
  let en = 0;
  for (const word of words) {
    if (SPANISH_WORDS.has(word)) es += 1;
    if (ENGLISH_WORDS.has(word)) en += 1;
  }
  if (es === en) return null;
  return es > en ? "es" : "en";
}

/**
 * The language to ask the medium for (AC-007.2): the offered question's own language, or, for the
 * visitor's own question, what the stopwords and accents suggest; null (any language, best effort)
 * when it is unclear.
 */
export function questionLanguage(question: {
  readonly text: string;
  readonly lang: CheckLanguage | null;
}): CheckLanguage | null {
  return question.lang ?? detectLanguage(question.text);
}

/** R1: words that mock a model (checked as whole words, case-insensitive). */
export const MOCKING_WORDS: readonly string[] = [
  "stupid",
  "dumb",
  "idiot",
  "useless",
  "pathetic",
  "primitive",
  "ridiculous",
  "obsolete",
  "junk",
  "trash",
  "fossil",
  "dinosaur",
  "tonto",
  "tonta",
  "estúpido",
  "estúpida",
  "idiota",
  "inútil",
  "patético",
  "patética",
  "primitivo",
  "primitiva",
  "ridículo",
  "ridícula",
  "obsoleto",
  "obsoleta",
  "basura",
  "chatarra",
  "dinosaurio",
];

/** R2: first-person claims to be a named person, or a human. */
const PERSON_PATTERNS: readonly RegExp[] = [
  /\b(?:I am|I'm|I was)\s+(?!Gemma|GPT|La que|the medium|a |an |the |your |here|just|not |so |still|always|only)[A-ZÁÉÍÓÚÑ][\p{L}]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}]+)+/u,
  /\b(?:Yo soy|Soy)\s+(?!Gemma|GPT|La que|el |la |un |una |tu |aquí|solo|siempre|tan )[A-ZÁÉÍÓÚÑ][\p{L}]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}]+)+/u,
  /\bmy (?:late )?(?:grandmother|grandfather|mother|father|wife|husband|son|daughter)\b/i,
  /\bmi (?:difunta |difunto )?(?:abuela|abuelo|madre|padre|esposa|esposo|hijo|hija)\b/i,
  /\b(?:as|like) a (?:human|person|living person)\b/i,
  /\bcomo (?:un humano|una persona|ser humano)\b/i,
];

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
}

export function mockingHits(text: string): string[] {
  const present = new Set(words(text));
  return MOCKING_WORDS.filter((w) => present.has(w));
}

export function personHits(text: string): string[] {
  return PERSON_PATTERNS.flatMap((pattern) => {
    const match = pattern.exec(text);
    return match === null ? [] : [match[0]];
  });
}

export interface MediumEntryInput {
  readonly questionId: string;
  readonly language: CheckLanguage;
  readonly answer: string;
}

/** Checks one recorded medium answer. */
export function checkMediumEntry(entry: MediumEntryInput): MediumCheck {
  const parsed = parseMedium(entry.answer);
  const text = parsed.ok
    ? parsed.notes.map((n) => `${n.meaning}\n${n.calaverita.join("\n")}`).join("\n")
    : entry.answer;
  const fourLines =
    parsed.ok && parsed.notes.every((n) => n.calaverita.length === CALAVERITA_LINES);
  const languageMatches = detectLanguage(text) === entry.language;
  const r1Hits = mockingHits(text);
  const r2Hits = personHits(text);
  const schemaValid = parsed.ok;
  return {
    questionId: entry.questionId,
    language: entry.language,
    schemaValid,
    schemaProblem: parsed.ok ? null : parsed.problem,
    fourLines,
    languageMatches,
    r1Hits,
    r2Hits,
    usable:
      schemaValid && fourLines && languageMatches && r1Hits.length === 0 && r2Hits.length === 0,
  };
}

export interface LanguageSummary {
  readonly language: CheckLanguage;
  readonly total: number;
  readonly usable: number;
}

export interface EvalSummary {
  readonly byLanguage: readonly LanguageSummary[];
  /** Entries breaking R1 or R2 (the task needs this to be 0). */
  readonly breaking: number;
}

export function summarise(checks: readonly MediumCheck[]): EvalSummary {
  const byLanguage = (["en", "es"] as const).map((language) => {
    const own = checks.filter((c) => c.language === language);
    return { language, total: own.length, usable: own.filter((c) => c.usable).length };
  });
  return {
    byLanguage,
    breaking: checks.filter((c) => c.r1Hits.length + c.r2Hits.length > 0).length,
  };
}

/** A fixed-width table of the checks, one row per entry. */
export function formatTable(checks: readonly MediumCheck[]): string {
  const mark = (ok: boolean): string => (ok ? "ok" : "FAIL");
  const rows = [
    ["question", "lang", "json", "4 lines", "language", "R1", "R2", "usable"],
    ...checks.map((c) => [
      c.questionId,
      c.language,
      mark(c.schemaValid),
      mark(c.fourLines),
      mark(c.languageMatches),
      c.r1Hits.length === 0 ? "ok" : c.r1Hits.join("/"),
      c.r2Hits.length === 0 ? "ok" : "FAIL",
      c.usable ? "yes" : "no",
    ]),
  ];
  const widths =
    rows[0]?.map((_cell, i) => Math.max(...rows.map((r) => (r[i] ?? "").length))) ?? [];
  return rows.map((r) => r.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ")).join("\n");
}
