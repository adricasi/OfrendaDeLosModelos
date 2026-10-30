/**
 * Prompt files (`prompts/*.md`, versioned) and the template function that fills them. User text
 * (the question, the ancestors' answers) is only ever inserted as escaped data through the
 * placeholders; it is never concatenated into the instructions, and inserted text is not
 * scanned for placeholders again (llm-features skill, section 2).
 */

export type QuestionLanguage = "en" | "es" | null;

export interface PromptFile {
  readonly id: string;
  readonly version: number;
  readonly body: string;
}

/** One ancestor's words, as data for the medium. */
export interface AncestorWords {
  readonly ancestorId: string;
  readonly name: string;
  readonly text: string;
}

export interface PromptValues {
  readonly question: string;
  readonly language: QuestionLanguage;
  readonly answers?: readonly AncestorWords[];
}

/** Longest answer shown to the medium, so a runaway answer cannot fill the context. */
export const MAX_ANSWER_CHARS = 700;
export const MAX_QUESTION_CHARS = 400;

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/;

export function parsePromptFile(text: string): PromptFile {
  const normalised = text.replaceAll("\r\n", "\n");
  const match = FRONT_MATTER.exec(normalised);
  if (match === null) throw new Error("A prompt file must start with a --- front matter block.");
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? "").split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  const id = fields.get("id");
  const version = Number(fields.get("version"));
  if (id === undefined || id === "") throw new Error("A prompt file needs an id.");
  if (!Number.isInteger(version) || version < 1) throw new Error("A prompt file needs a version.");
  return { id, version, body: normalised.slice(match[0].length).trim() };
}

/** Data never closes or opens a delimiter: angle brackets become entities. */
export function escapeData(text: string): string {
  return text.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

const LANGUAGE_NAMES: Readonly<Record<"en" | "es", string>> = {
  en: "English",
  es: "Spanish (español)",
};

/** AC-007.2: the language of the question; other languages get the generic instruction. */
export function languageName(language: QuestionLanguage): string {
  return language === null
    ? "the same language as the text inside <question>"
    : LANGUAGE_NAMES[language];
}

function renderAnswers(answers: readonly AncestorWords[]): string {
  return answers
    .map(
      (a) =>
        `<answer id="${escapeData(a.ancestorId)}" name="${escapeData(a.name)}">\n${escapeData(clip(a.text, MAX_ANSWER_CHARS))}\n</answer>`,
    )
    .join("\n");
}

/** Fills `{{language}}`, `{{question}}`, `{{answers}}` and `{{ids}}` in one pass. */
export function fillPrompt(file: PromptFile, values: PromptValues): string {
  const answers = values.answers ?? [];
  const replacements: Readonly<Record<string, string>> = {
    language: languageName(values.language),
    question: escapeData(clip(values.question, MAX_QUESTION_CHARS)),
    answers: renderAnswers(answers),
    ids: answers.map((a) => a.ancestorId).join(", "),
  };
  return file.body.replaceAll(
    /\{\{(language|question|answers|ids)\}\}/g,
    (_match, key: string) => replacements[key] ?? "",
  );
}

/** The retry prompt: the same request plus what was wrong with the first reply (plain text). */
export function retryPrompt(prompt: string, problem: string): string {
  return `${prompt}\n\nYour previous reply could not be used: ${problem} Reply again with only the JSON array.`;
}
