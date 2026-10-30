/**
 * Turns the blocked words into token-id sequences for transformers.js's `bad_words_ids`
 * (`NoBadWordsLogitsProcessor`): when the text so far ends with a sequence minus its last
 * token, that last token gets probability 0. A word is tokenised in the forms a tokenizer
 * sees at the start of a word, in the middle of a sentence and in capitals.
 */
export function blockedTokenSequences(
  words: readonly string[],
  encode: (text: string) => readonly number[],
): number[][] {
  const sequences = new Map<string, number[]>();
  for (const word of words) {
    const trimmed = word.trim();
    if (trimmed === "") continue;
    const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    const spellings = new Set([trimmed, capitalised, trimmed.toUpperCase()]);
    for (const spelling of spellings) {
      for (const form of [spelling, ` ${spelling}`]) {
        const ids = [...encode(form)];
        if (ids.length > 0) sequences.set(ids.join(","), ids);
      }
    }
  }
  return [...sequences.values()];
}
