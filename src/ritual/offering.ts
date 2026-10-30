import type { OfferedQuestion } from "../data/validate.js";
import type { Question } from "./types.js";

export const MAX_QUESTION_LENGTH = 280;

export type OfferingError = "empty" | "too-long";

export type OwnQuestionResult =
  | { readonly ok: true; readonly question: Question }
  | { readonly ok: false; readonly error: OfferingError };

export const OFFERING_ERROR_MESSAGES: Readonly<Record<OfferingError, string>> = {
  empty: "Write a question first, or choose one of the offered ones.",
  "too-long": `Your question is too long. Please keep it to ${String(MAX_QUESTION_LENGTH)} characters or fewer.`,
};

/** Length in characters as a person counts them (an emoji is one, not two). */
export function characterCount(text: string): number {
  return [...text].length;
}

/** AC-002.2, AC-002.3: trims, then accepts 1 to 280 characters. */
export function validateOwnQuestion(raw: string): OwnQuestionResult {
  const text = raw.trim();
  if (text === "") return { ok: false, error: "empty" };
  if (characterCount(text) > MAX_QUESTION_LENGTH) return { ok: false, error: "too-long" };
  return { ok: true, question: { text, offeredId: null, lang: null } };
}

/** AC-002.1: an offered question in the chosen language. */
export function offeredQuestion(offered: OfferedQuestion, lang: "en" | "es"): Question {
  return { text: offered[lang], offeredId: offered.id, lang };
}
