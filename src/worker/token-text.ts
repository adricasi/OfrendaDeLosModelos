/**
 * Turns generated token ids into the text each token adds. Decoding one token alone is wrong
 * for byte-level tokenizers (a character can span several tokens), so the whole answer so far
 * is decoded and the new tail is the token's text. When the tail ends in an incomplete
 * character (U+FFFD) the token adds no text yet; its characters arrive with the next token.
 */
export class TokenTextAssembler {
  private readonly ids: number[] = [];
  private emitted = "";

  constructor(private readonly decode: (ids: readonly number[]) => string) {}

  /** The text added by `id`, possibly "" while a character is still incomplete. */
  push(id: number): string {
    this.ids.push(id);
    const full = this.decode(this.ids);
    if (full.endsWith("�")) return "";
    const added = full.slice(this.emitted.length);
    this.emitted = full;
    return added;
  }
}
