/**
 * Minimal Ollama HTTP client for the recording tool. Fields used, from Ollama's docs/api.md:
 *   GET  /api/version -> { version }
 *   GET  /api/tags    -> { models: [{ name, model, digest, ... }] }
 *   POST /api/generate { model, prompt, stream: false, options: { temperature, seed, num_predict } }
 *        -> { model, response, done, ... }
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface GenerateOptions {
  readonly temperature: number;
  readonly seed: number;
  readonly numPredict: number;
}

export class OllamaUnreachableError extends Error {
  constructor(baseUrl: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `Cannot reach Ollama at ${baseUrl} (${reason}). Is it running? Start it with "ollama serve".`,
    );
    this.name = "OllamaUnreachableError";
  }
}

export class OllamaApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaApiError";
  }
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The recorder only talks to Ollama on this machine (never expose the raw runtime on a LAN). */
export function assertLoopbackUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`ollamaBaseUrl is not a valid URL: "${baseUrl}"`);
  }
  if (url.protocol !== "http:") {
    throw new Error(`ollamaBaseUrl must use http on loopback, got "${url.protocol}"`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to talk to Ollama at "${url.hostname}": only loopback hosts (127.0.0.1, localhost, ::1) are allowed.`,
    );
  }
  return url;
}

/** Ollama lists a bare name as "<name>:latest". */
export function normalizeTag(tag: string): string {
  return tag.includes(":") ? tag : `${tag}:latest`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class OllamaClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
  ) {
    this.base = assertLoopbackUrl(baseUrl).origin;
  }

  private async request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.base}${path}`, init);
    } catch (error) {
      throw new OllamaUnreachableError(this.base, error);
    }
    if (!response.ok) {
      throw new OllamaApiError(`Ollama ${path} answered HTTP ${response.status}`);
    }
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new OllamaApiError(`Ollama ${path} did not return a JSON object`);
    return body;
  }

  async version(): Promise<string> {
    const body = await this.request("/api/version");
    if (typeof body["version"] !== "string") {
      throw new OllamaApiError("Ollama /api/version has no version string");
    }
    return body["version"];
  }

  /** Local model digests by normalised tag. */
  async digests(): Promise<ReadonlyMap<string, string>> {
    const body = await this.request("/api/tags");
    const models = body["models"];
    if (!Array.isArray(models)) throw new OllamaApiError("Ollama /api/tags has no models list");
    const digests = new Map<string, string>();
    for (const model of models) {
      if (!isRecord(model)) continue;
      const name = model["name"] ?? model["model"];
      if (typeof name === "string" && typeof model["digest"] === "string") {
        digests.set(normalizeTag(name), model["digest"]);
      }
    }
    return digests;
  }

  async generate(tag: string, prompt: string, options: GenerateOptions): Promise<string> {
    const body = await this.request("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: tag,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature,
          seed: options.seed,
          num_predict: options.numPredict,
        },
      }),
    });
    if (body["done"] !== true || typeof body["response"] !== "string") {
      throw new OllamaApiError(`Ollama /api/generate for ${tag} returned no complete response`);
    }
    return body["response"];
  }
}
