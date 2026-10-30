/**
 * Words GPT-2 is not allowed to say (AC-003.4). GPT-2 is an unfiltered 2019 model trained on
 * web text, and the altar is a place of respect. The list is deliberately short: strong
 * profanity and slurs only. Each word is blocked in the spellings a tokenizer sees at the
 * start of a word (see `src/worker/blocked-tokens.ts`). A cultural reviewer may extend it.
 *
 * The words are stored base64-encoded, one per line, only so that slurs do not appear in plain
 * text in a public repository, in code search results or in diffs that are skimmed. This is
 * not secrecy and not security: the list is decoded at load, and the test in
 * test/blocked-words.test.ts checks what it contains. To read or edit it:
 *   node -e 'console.log(Buffer.from(process.argv[1], "base64").toString())' "<the string>"
 */
const ENCODED_BLOCKED_WORDS =
  "ZnVjawpmdWNraW5nCm1vdGhlcmZ1Y2tlcgpzaGl0CmJpdGNoCmJhc3RhcmQKY3VudAphc3Nob2xl" +
  "Cndob3JlCnNsdXQKbmlnZ2VyCm5pZ2dhCmZhZ2dvdApyZXRhcmQ=";

function decode(encoded: string): string[] {
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new TextDecoder()
    .decode(bytes)
    .split("\n")
    .filter((word) => word !== "");
}

export const BLOCKED_WORDS: readonly string[] = decode(ENCODED_BLOCKED_WORDS);
