/**
 * Words GPT-2 is not allowed to say (AC-003.4). GPT-2 is an unfiltered 2019 model trained on
 * web text, and the altar is a place of respect. The list is deliberately short: strong
 * profanity and slurs only. Each word is blocked in the spellings a tokenizer sees at the
 * start of a word (see `src/worker/blocked-tokens.ts`). A cultural reviewer may extend it.
 */
export const BLOCKED_WORDS: readonly string[] = [
  "fuck",
  "fucking",
  "motherfucker",
  "shit",
  "bitch",
  "bastard",
  "cunt",
  "asshole",
  "whore",
  "slut",
  "nigger",
  "nigga",
  "faggot",
  "retard",
];
