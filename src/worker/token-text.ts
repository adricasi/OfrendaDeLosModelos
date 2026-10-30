/**
 * A UTF-8 character has at most 4 bytes, so a character that is still incomplete after this
 * many tokens never completes: its text is shown as it is instead of being held back forever.
 */
export const MAX_HELD_TOKENS = 4;

/**
 * Turns generated token ids into the text each token adds. Decoding one token alone is wrong
 * for byte-level tokenizers (a character can span several tokens), so the whole answer so far
 * is decoded and the new tail is the token's text. When the tail ends in an incomplete
 * character (U+FFFD) the token adds no text yet; its characters arrive with the next token,
 * for at most `MAX_HELD_TOKENS` tokens.
 */
export class TokenTextAssembler {
  private readonly ids: number[] = [];
  private emitted = "";
  private held = 0;

  constructor(private readonly decode: (ids: readonly number[]) => string) {}

  /** The text added by `id`, possibly "" while a character is still incomplete. */
  push(id: number): string {
    this.ids.push(id);
    const full = this.decode(this.ids);
    if (full.endsWith("�") && this.held < MAX_HELD_TOKENS) {
      this.held += 1;
      return "";
    }
    this.held = 0;
    const added = full.slice(this.emitted.length);
    this.emitted = full;
    return added;
  }
}
