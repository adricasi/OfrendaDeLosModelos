import type { MediumNote } from "../ritual/types.js";

/** AC-007.3 (R3): a calaverita has exactly four lines. */
export const CALAVERITA_LINES = 4;

export type MediumParse =
  | { readonly ok: true; readonly notes: readonly MediumNote[] }
  | { readonly ok: false; readonly problem: string };

/**
 * The end of the balanced top-level array that starts at `start`, or -1. Brackets inside JSON
 * strings (and escaped quotes) do not count, so a "]" or a literal ``` inside a string is safe.
 */
function balancedArrayEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (char === "\\") i += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "[" || char === "{") {
      depth += 1;
    } else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return char === "]" ? i : -1;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

/**
 * The JSON text of a reply: the first complete top-level array that parses, wherever it sits
 * (alone, in a ```json fence, after or before prose, even when the prose has a "[" of its own).
 * When there is none the trimmed reply is returned and parsing it reports the problem.
 */
export function extractJson(reply: string): string {
  const text = reply.trim();
  for (let start = text.indexOf("["); start !== -1; start = text.indexOf("[", start + 1)) {
    const end = balancedArrayEnd(text, start);
    if (end === -1) continue;
    const candidate = text.slice(start, end + 1);
    try {
      if (Array.isArray(JSON.parse(candidate))) return candidate;
    } catch {
      // Not JSON (for example "[see below]"): try the next "[".
    }
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict validation of the medium's reply (design.md, Interfaces: medium output):
 * `[{ancestorId, meaning, calaverita: [4 strings]}]`, one entry for each expected ancestor id
 * (when `expectedIds` is given), none unknown, none twice. Problems are fixed phrases plus the
 * expected ids, never the model's own text, so they can safely go into a retry prompt.
 */
export function parseMedium(reply: string, expectedIds?: readonly string[]): MediumParse {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(reply));
  } catch {
    return { ok: false, problem: "It was not valid JSON." };
  }
  if (!Array.isArray(data)) return { ok: false, problem: "It was not a JSON array." };
  if (data.length === 0) return { ok: false, problem: "The array was empty." };
  const notes: MediumNote[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of data.entries()) {
    const where = `Entry ${String(index + 1)}`;
    if (!isRecord(entry)) return { ok: false, problem: `${where} was not an object.` };
    const { ancestorId, meaning, calaverita } = entry;
    if (typeof ancestorId !== "string" || ancestorId === "") {
      return { ok: false, problem: `${where} has no ancestorId.` };
    }
    if (expectedIds !== undefined && !expectedIds.includes(ancestorId)) {
      return { ok: false, problem: `${where} names an ancestorId that was not asked for.` };
    }
    if (seen.has(ancestorId)) return { ok: false, problem: `${where} repeats an ancestorId.` };
    seen.add(ancestorId);
    if (typeof meaning !== "string" || meaning.trim() === "") {
      return { ok: false, problem: `${where} has no meaning text.` };
    }
    if (
      !Array.isArray(calaverita) ||
      calaverita.length !== CALAVERITA_LINES ||
      !calaverita.every((l): l is string => typeof l === "string" && l.trim() !== "")
    ) {
      return {
        ok: false,
        problem: `${where} needs a calaverita of exactly ${String(CALAVERITA_LINES)} non-empty lines.`,
      };
    }
    notes.push({
      ancestorId,
      meaning: meaning.trim(),
      calaverita: calaverita.map((l) => l.trim()),
    });
  }
  const missing = expectedIds?.filter((id) => !seen.has(id)) ?? [];
  if (missing.length > 0) {
    return { ok: false, problem: `Entries are missing for: ${missing.join(", ")}.` };
  }
  // Show them in the altar's order, whatever order the model used.
  if (expectedIds !== undefined) {
    notes.sort((a, b) => expectedIds.indexOf(a.ancestorId) - expectedIds.indexOf(b.ancestorId));
  }
  return { ok: true, notes };
}
