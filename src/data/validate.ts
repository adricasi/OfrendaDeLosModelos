/**
 * Hand-written validators for the static JSON in public/data/. They fail fast with a message
 * that names the file and the path of the first problem. Every link must be https.
 */

export class DataValidationError extends Error {
  constructor(file: string, path: string, problem: string) {
    super(`${file}: ${path} ${problem}`);
    this.name = "DataValidationError";
  }
}

export interface Licence {
  readonly name: string;
  readonly url: string;
}

export interface Ancestor {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly year: number;
  readonly size: string | null;
  readonly kind: "live" | "recorded";
  readonly licence: Licence;
  readonly modelCardUrl: string;
  readonly repositoryId: string | null;
  readonly revision: string | null;
  /** ONNX weight precision per runtime; null lets the worker choose. */
  readonly dtypes: { readonly webgpu?: string; readonly wasm?: string } | null;
  readonly settings: { readonly maxTokens: number; readonly temperature: number } | null;
  readonly verify: string | null;
}

export interface OfferedQuestion {
  readonly id: string;
  readonly en: string;
  readonly es: string;
}

export interface DarkFrame {
  readonly id: string;
  readonly name: string;
  readonly maker: string;
  readonly event: string;
  readonly date: string;
  readonly yearsOfService: string | null;
  readonly sourceUrl: string;
}

export interface CreditSource {
  readonly id: string;
  readonly title: string;
  readonly publisher: string;
  readonly url: string;
  readonly usedFor: string;
}

export interface Credits {
  readonly assets: string;
  /** NFR-010: true until the cultural reviewer has approved the ritual's texts. */
  readonly culturalReviewPending: boolean;
  readonly sources: readonly CreditSource[];
}

type Record_ = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Reader {
  constructor(
    private readonly file: string,
    private readonly path: string,
    private readonly value: Record_,
  ) {}

  private fail(key: string, problem: string): never {
    throw new DataValidationError(this.file, `${this.path}.${key}`, problem);
  }

  raw(key: string): unknown {
    return this.value[key];
  }

  string(key: string): string {
    const v = this.value[key];
    if (typeof v !== "string" || v.trim() === "") this.fail(key, "must be a non-empty string");
    return v;
  }

  nullableString(key: string): string | null {
    const v = this.value[key];
    if (v === null || v === undefined) return null;
    return this.string(key);
  }

  integer(key: string): number {
    const v = this.value[key];
    if (typeof v !== "number" || !Number.isInteger(v)) this.fail(key, "must be an integer");
    return v;
  }

  positiveNumber(key: string): number {
    const v = this.value[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      this.fail(key, "must be a positive number");
    }
    return v;
  }

  boolean(key: string): boolean {
    const v = this.value[key];
    if (typeof v !== "boolean") this.fail(key, "must be true or false");
    return v;
  }

  /** A pinned model revision: a full 40-character commit hash, never a branch or tag name. */
  nullableCommitHash(key: string): string | null {
    const v = this.nullableString(key);
    if (v !== null && !/^[0-9a-f]{40}$/.test(v)) {
      this.fail(key, `must be a full 40-character lowercase commit hash, got "${v}"`);
    }
    return v;
  }

  oneOf<T extends string>(key: string, allowed: readonly T[]): T {
    const v = this.value[key];
    const match = allowed.find((candidate) => candidate === v);
    if (match === undefined) this.fail(key, `must be one of ${allowed.join(", ")}`);
    return match;
  }

  /** A link: only https is accepted, so javascript:, http: and data: are rejected. */
  httpsUrl(key: string): string {
    const v = this.string(key);
    if (!isHttpsUrl(v)) this.fail(key, `must be an https URL, got "${v}"`);
    return v;
  }

  isoDate(key: string): string {
    const v = this.string(key);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !isRealDate(v)) {
      this.fail(key, `must be a real date like 2025-07-21, got "${v}"`);
    }
    return v;
  }

  record(key: string): Reader {
    const v = this.value[key];
    if (!isRecord(v)) this.fail(key, "must be an object");
    return new Reader(this.file, `${this.path}.${key}`, v);
  }

  nullableRecord(key: string): Reader | null {
    const v = this.value[key];
    return v === null || v === undefined ? null : this.record(key);
  }
}

/** Round-trips the date so impossible ones such as 2025-02-31 are rejected. */
function isRealDate(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function root(file: string, input: unknown): Reader {
  if (!isRecord(input)) throw new DataValidationError(file, "(root)", "must be an object");
  return new Reader(file, "", input);
}

function items<T>(
  file: string,
  input: unknown,
  key: string,
  parse: (reader: Reader) => T,
  idOf: (item: T) => string,
): T[] {
  const list = root(file, input).raw(key);
  if (!Array.isArray(list) || list.length === 0) {
    throw new DataValidationError(file, `.${key}`, "must be a non-empty array");
  }
  const seen = new Set<string>();
  return list.map((entry: unknown, index: number) => {
    const path = `.${key}[${index}]`;
    if (!isRecord(entry)) throw new DataValidationError(file, path, "must be an object");
    const item = parse(new Reader(file, path, entry));
    const id = idOf(item);
    if (seen.has(id)) throw new DataValidationError(file, `${path}.id`, `is a duplicate: "${id}"`);
    seen.add(id);
    return item;
  });
}

function parseDtypes(reader: Reader): { webgpu?: string; wasm?: string } {
  const webgpu = reader.nullableString("webgpu");
  const wasm = reader.nullableString("wasm");
  return {
    ...(webgpu === null ? {} : { webgpu }),
    ...(wasm === null ? {} : { wasm }),
  };
}

export function parseAncestors(input: unknown): Ancestor[] {
  return items(
    "ancestors.json",
    input,
    "ancestors",
    (r): Ancestor => {
      const licence = r.record("licence");
      const settings = r.nullableRecord("settings");
      const dtypes = r.nullableRecord("dtypes");
      return {
        id: r.string("id"),
        name: r.string("name"),
        family: r.string("family"),
        year: r.integer("year"),
        size: r.nullableString("size"),
        kind: r.oneOf("kind", ["live", "recorded"] as const),
        licence: { name: licence.string("name"), url: licence.httpsUrl("url") },
        modelCardUrl: r.httpsUrl("modelCardUrl"),
        repositoryId: r.nullableString("repositoryId"),
        revision: r.nullableCommitHash("revision"),
        dtypes: dtypes === null ? null : parseDtypes(dtypes),
        settings:
          settings === null
            ? null
            : {
                maxTokens: settings.positiveNumber("maxTokens"),
                temperature: settings.positiveNumber("temperature"),
              },
        verify: r.nullableString("verify"),
      };
    },
    (a) => a.id,
  );
}

export function parseOfferedQuestions(input: unknown): OfferedQuestion[] {
  return items(
    "offered-questions.json",
    input,
    "questions",
    (r) => ({ id: r.string("id"), en: r.string("en"), es: r.string("es") }),
    (q) => q.id,
  );
}

export function parseDarkFrames(input: unknown): DarkFrame[] {
  return items(
    "dark-frames.json",
    input,
    "darkFrames",
    (r) => ({
      id: r.string("id"),
      name: r.string("name"),
      maker: r.string("maker"),
      event: r.string("event"),
      date: r.isoDate("date"),
      yearsOfService: r.nullableString("yearsOfService"),
      // AC-008.2: a retired model without an official https source is never shown.
      sourceUrl: r.httpsUrl("sourceUrl"),
    }),
    (d) => d.id,
  );
}

export function parseCredits(input: unknown): Credits {
  const top = root("credits.json", input);
  const sources = items(
    "credits.json",
    input,
    "sources",
    (r) => ({
      id: r.string("id"),
      title: r.string("title"),
      publisher: r.string("publisher"),
      url: r.httpsUrl("url"),
      usedFor: r.string("usedFor"),
    }),
    (s) => s.id,
  );
  return {
    assets: top.string("assets"),
    culturalReviewPending: top.boolean("culturalReviewPending"),
    sources,
  };
}
