import answerPrompt from "../../prompts/gemma4-answer.md?raw";
import mediumPrompt from "../../prompts/medium.md?raw";

import { fillPrompt, parsePromptFile, type PromptValues } from "./template.js";

/** The shipped prompt files (single source of truth: `prompts/`), bundled as text. */
const medium = parsePromptFile(mediumPrompt);
const answer = parsePromptFile(answerPrompt);

export const MEDIUM_PROMPT_VERSION = medium.version;

export function buildMediumPrompt(values: PromptValues): string {
  return fillPrompt(medium, values);
}

export function buildAnswerPrompt(values: PromptValues): string {
  return fillPrompt(answer, values);
}
