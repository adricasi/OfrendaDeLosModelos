import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  emptyRecordedVoices,
  parseRecordedVoices,
  serializeRecordedVoices,
} from "../src/data/recorded-voices.js";
import { assertKnownIds } from "../src/data/recorded-voices.js";
import { parseAncestors, parseOfferedQuestions } from "../src/data/validate.js";
import { OllamaClient, OllamaUnreachableError, assertLoopbackUrl } from "../scripts/ollama.js";
import { parseArgs } from "../scripts/args.js";
import { parseRecorderConfig, recordVoices as recordVoicesStrict } from "../scripts/record.js";
import type { RecorderConfig, RecorderDeps } from "../scripts/record.js";

/** The shipped tags are unverified, so the tests pass the flag unless they test the refusal. */
const recordVoices = (
  config: RecorderConfig,
  previous: Parameters<typeof recordVoicesStrict>[1],
  deps: RecorderDeps,
) => recordVoicesStrict(config, previous, { allowUnverified: true, ...deps });

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

function shippedText(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function shippedConfig(): unknown {
  return JSON.parse(shippedText("scripts/record-voices.config.json"));
}

interface FakeOllama {
  readonly url: string;
  readonly requests: { path: string; body: Record<string, unknown> | null }[];
  close(): Promise<void>;
}

/** A stub of the three Ollama endpoints the tool uses, listening on 127.0.0.1. */
async function startFakeOllama(installed: Record<string, string>): Promise<FakeOllama> {
  const requests: FakeOllama["requests"] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    req.on("end", () => {
      const body = raw === "" ? null : (JSON.parse(raw) as Record<string, unknown>);
      requests.push({ path: req.url ?? "", body });
      res.setHeader("content-type", "application/json");
      if (req.url === "/api/version") {
        res.end(JSON.stringify({ version: "0.12.3" }));
      } else if (req.url === "/api/tags") {
        const models = Object.entries(installed).map(([name, digest]) => ({
          name,
          model: name,
          digest,
        }));
        res.end(JSON.stringify({ models }));
      } else if (req.url === "/api/generate" && body !== null) {
        res.end(
          JSON.stringify({
            model: body["model"],
            response: `  answer from ${String(body["model"])} to: ${String(body["prompt"])}\n`,
            done: true,
          }),
        );
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function promptOf(request: FakeOllama["requests"][number]): string {
  const prompt = request.body?.["prompt"];
  return typeof prompt === "string" ? prompt : "";
}

function configFor(url: string, overrides: Partial<RecorderConfig> = {}): RecorderConfig {
  return { ...parseRecorderConfig(shippedConfig()), ollamaBaseUrl: url, ...overrides };
}

const fixedNow = (): Date => new Date("2026-10-30T10:00:00.000Z");

const files: Record<string, string> = {
  "public/data/offered-questions.json": shippedText("public/data/offered-questions.json"),
};
const readText = (path: string): string | null => files[path] ?? null;

let fake: FakeOllama | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

describe("recording tool (REQ-013)", () => {
  it("AC-013.1: asks every installed ancestor every offered question in both languages", async () => {
    fake = await startFakeOllama({
      "gemma:2b": DIGEST_A,
      "gemma2:2b": DIGEST_A,
      "gemma3:1b": DIGEST_B,
      "gemma4:e2b": DIGEST_B,
    });
    const { file } = await recordVoices(configFor(fake.url), emptyRecordedVoices(), {
      readText,
      now: fixedNow,
    });
    // 4 ancestors x 6 questions x 2 languages
    expect(file.voices).toHaveLength(48);
    const first = file.voices[0];
    expect(first?.ancestorId).toBe("gemma-1");
    expect(first?.questionId).toBe("when-we-die");
    expect(first?.language).toBe("en");
    // The model's text is stored without surrounding whitespace and nothing else.
    expect(first?.answer).toBe("answer from gemma:2b to: What happens when we die?");
    expect(file.voices.at(-1)?.ancestorId).toBe("gemma-4-e2b");
    expect(file.voices.at(-1)?.language).toBe("es");
    expect(file.medium).toEqual([]);
  });

  it("uses the documented Ollama request: non-streaming /api/generate with seed and num_predict", async () => {
    fake = await startFakeOllama({ "gemma:2b": DIGEST_A });
    await recordVoices(configFor(fake.url), emptyRecordedVoices(), { readText, now: fixedNow });
    const generate = fake.requests.find((r) => r.path === "/api/generate");
    expect(generate?.body).toEqual({
      model: "gemma:2b",
      prompt: "What happens when we die?",
      stream: false,
      options: { temperature: 0, seed: 42, num_predict: 120 },
    });
  });

  it("AC-013.2: stores model name, tag, digest, licence, settings, date and runtime version", async () => {
    fake = await startFakeOllama({ "gemma:2b": DIGEST_A, "gemma4:e2b": DIGEST_B });
    const { file } = await recordVoices(configFor(fake.url), emptyRecordedVoices(), {
      readText,
      now: fixedNow,
    });
    expect(file.voices[0]).toMatchObject({
      model: {
        name: "Gemma 1",
        tag: "gemma:2b",
        digest: DIGEST_A,
        licence: { name: "Gemma Terms of Use", url: "https://ai.google.dev/gemma/terms" },
      },
      settings: { temperature: 0, seed: 42, numPredict: 120 },
      recordedAt: "2026-10-30T10:00:00.000Z",
      runtime: { name: "ollama", version: "0.12.3" },
    });
    const gemma4 = file.voices.find((v) => v.ancestorId === "gemma-4-e2b");
    expect(gemma4?.model.licence.name).toBe("Apache-2.0");
    expect(gemma4?.model.digest).toBe(DIGEST_B);
  });

  it("AC-013.3: skips a missing model with a clear message and records the others", async () => {
    fake = await startFakeOllama({ "gemma:2b": DIGEST_A, "gemma4:e2b": DIGEST_B });
    const messages: string[] = [];
    const { file, skippedAncestors } = await recordVoices(
      configFor(fake.url),
      emptyRecordedVoices(),
      { readText, now: fixedNow, log: (m) => messages.push(m) },
    );
    expect(skippedAncestors).toEqual(["gemma-2", "gemma-3"]);
    expect(new Set(file.voices.map((v) => v.ancestorId))).toEqual(
      new Set(["gemma-1", "gemma-4-e2b"]),
    );
    expect(messages).toContain(
      'SKIP Gemma 2: model "gemma2:2b" is not installed. Run "ollama pull gemma2:2b" to record it.',
    );
  });

  it("keeps earlier recordings of an ancestor that is skipped in this run", async () => {
    fake = await startFakeOllama({ "gemma4:e2b": DIGEST_B });
    const first = await startFakeOllama({ "gemma:2b": DIGEST_A });
    const earlier = await recordVoices(configFor(first.url), emptyRecordedVoices(), {
      readText,
      now: fixedNow,
    });
    await first.close();
    const { file } = await recordVoices(configFor(fake.url), earlier.file, {
      readText,
      now: fixedNow,
    });
    expect(file.voices.filter((v) => v.ancestorId === "gemma-1")).toHaveLength(12);
    expect(file.voices.filter((v) => v.ancestorId === "gemma-4-e2b")).toHaveLength(12);
  });

  it("matches a bare tag to Ollama's :latest name", async () => {
    fake = await startFakeOllama({ "gemma:latest": DIGEST_A });
    const config = configFor(fake.url);
    const bare: RecorderConfig = {
      ...config,
      ancestors: config.ancestors.map((a) => (a.id === "gemma-1" ? { ...a, tag: "gemma" } : a)),
    };
    const { file } = await recordVoices(bare, emptyRecordedVoices(), { readText, now: fixedNow });
    expect(file.voices).toHaveLength(12);
  });

  it("fails with a clear message when Ollama is not reachable", async () => {
    const down = (): Promise<Response> => {
      throw new TypeError("fetch failed");
    };
    await expect(
      recordVoices(configFor("http://127.0.0.1:1"), emptyRecordedVoices(), {
        readText,
        fetch: down,
      }),
    ).rejects.toThrow(/Cannot reach Ollama at http:\/\/127\.0\.0\.1:1 .*ollama serve/);
    await expect(
      recordVoices(configFor("http://127.0.0.1:1"), emptyRecordedVoices(), {
        readText,
        fetch: down,
      }),
    ).rejects.toBeInstanceOf(OllamaUnreachableError);
  });

  it("output is byte-identical for identical inputs and a fixed clock", async () => {
    fake = await startFakeOllama({ "gemma:2b": DIGEST_A, "gemma4:e2b": DIGEST_B });
    const run = async (): Promise<string> => {
      const { file } = await recordVoices(configFor(fake?.url ?? ""), emptyRecordedVoices(), {
        readText,
        now: fixedNow,
      });
      return serializeRecordedVoices(file);
    };
    const a = await run();
    const b = await run();
    expect(a).toBe(b);
    expect(a.endsWith("}\n")).toBe(true);
    expect(Object.keys(JSON.parse(a) as object)).toEqual(["schemaVersion", "voices", "medium"]);
  });
});

describe("medium phase (AC-007.5)", () => {
  const template =
    "---\nid: medium\nversion: 1\n---\nQuestion: {{question}}\nAnswers:\n{{answers}}\nWrite a calaverita.";

  it("is enabled in the shipped config and reads the shared prompt file", () => {
    const { medium } = parseRecorderConfig(shippedConfig());
    expect(medium.enabled).toBe(true);
    expect(medium.promptFile).toBe("prompts/medium.md");
  });

  it("does not call the model for the medium while disabled", async () => {
    fake = await startFakeOllama({ "gemma4:e2b": DIGEST_B });
    const config = configFor(fake.url);
    await recordVoices(
      { ...config, medium: { ...config.medium, enabled: false } },
      emptyRecordedVoices(),
      { readText, now: fixedNow },
    );
    const prompts = fake.requests.map((r) => promptOf(r));
    expect(prompts.some((p) => p.includes("calaverita"))).toBe(false);
  });

  it("when enabled with a prompt file, records the medium's words with the prompt hash", async () => {
    fake = await startFakeOllama({ "gemma:2b": DIGEST_A, "gemma4:e2b": DIGEST_B });
    const config = configFor(fake.url);
    const enabled: RecorderConfig = { ...config, medium: { ...config.medium, enabled: true } };
    const { file } = await recordVoices(enabled, emptyRecordedVoices(), {
      readText: (path) => (path === "prompts/medium.md" ? template : readText(path)),
      now: fixedNow,
    });
    expect(file.medium).toHaveLength(12);
    const entry = file.medium[0];
    expect(entry?.questionId).toBe("when-we-die");
    expect(entry?.model.tag).toBe("gemma4:e2b");
    expect(entry?.prompt.file).toBe("prompts/medium.md");
    expect(entry?.prompt.sha256).toMatch(/^[0-9a-f]{64}$/);
    // The medium prompt carried the recorded answers of the ancestors.
    const mediumRequest = fake.requests.find((r) => promptOf(r).includes("Write a calaverita."));
    expect(String(mediumRequest?.body?.["prompt"])).toContain("answer from gemma:2b");
  });

  it("skips the medium with a message while the prompt file does not exist", async () => {
    fake = await startFakeOllama({ "gemma4:e2b": DIGEST_B });
    const config = configFor(fake.url);
    const messages: string[] = [];
    const { file } = await recordVoices(
      { ...config, medium: { ...config.medium, enabled: true } },
      emptyRecordedVoices(),
      { readText, now: fixedNow, log: (m) => messages.push(m) },
    );
    expect(file.medium).toEqual([]);
    expect(messages.some((m) => m.startsWith("SKIP medium: prompt file"))).toBe(true);
  });
});

describe("loopback only", () => {
  it.each(["http://127.0.0.1:11434", "http://localhost:11434", "http://[::1]:11434"])(
    "accepts %s",
    (url) => {
      expect(() => assertLoopbackUrl(url)).not.toThrow();
    },
  );

  it.each([
    "http://127.0.0.1.evil.com:11434",
    "http://127.0.0.1@evil.com:11434",
    "http://localhost.:11434",
    "http://[::ffff:127.0.0.1]:11434",
    "http://192.168.1.20:11434",
    "http://example.com:11434",
    "http://0.0.0.0:11434",
    "https://127.0.0.1:11434",
    "not a url",
  ])("refuses %s", (url) => {
    expect(() => assertLoopbackUrl(url)).toThrow();
  });

  it("refuses a non-loopback host in the config and never calls fetch", () => {
    const config = { ...(shippedConfig() as object), ollamaBaseUrl: "http://10.0.0.5:11434" };
    expect(() => parseRecorderConfig(config)).toThrow(/only loopback hosts/);
    let called = false;
    expect(
      () =>
        new OllamaClient("http://10.0.0.5:11434", () => {
          called = true;
          return Promise.reject(new Error("no"));
        }),
    ).toThrow();
    expect(called).toBe(false);
  });
});

describe("shipped config and data", () => {
  it("lists the four recorded ancestors consistent with ancestors.json, tags unverified", () => {
    const config = parseRecorderConfig(shippedConfig());
    const ancestors = parseAncestors(JSON.parse(shippedText("public/data/ancestors.json")));
    expect(config.ancestors.map((a) => a.tag)).toEqual([
      "gemma:2b",
      "gemma2:2b",
      "gemma3:1b",
      "gemma4:e2b",
    ]);
    for (const entry of config.ancestors) {
      const match = ancestors.find((a) => a.id === entry.id);
      expect(match?.name).toBe(entry.name);
      expect(match?.licence).toEqual(entry.licence);
      expect(entry.verified).toBe(false);
    }
    expect(config.generation).toEqual({ temperature: 0, seed: 42, numPredict: 120 });
  });

  it("the committed placeholder recorded-voices.json is valid and empty", () => {
    const file = parseRecordedVoices(JSON.parse(shippedText("public/data/recorded-voices.json")));
    expect(file).toEqual(emptyRecordedVoices());
  });
});

describe("recorded-voices.json validation", () => {
  const provenance = {
    model: {
      name: "Gemma 1",
      tag: "gemma:2b",
      digest: DIGEST_A,
      licence: { name: "Gemma Terms of Use", url: "https://ai.google.dev/gemma/terms" },
    },
    settings: { temperature: 0, seed: 42, numPredict: 120 },
    recordedAt: "2026-10-30T10:00:00.000Z",
    runtime: { name: "ollama", version: "0.12.3" },
  };
  const voice = {
    ancestorId: "gemma-1",
    questionId: "love-poem",
    questionText: "Write a love poem.",
    language: "en",
    answer: "Roses.",
    ...provenance,
  };
  const valid = { schemaVersion: 1, voices: [voice], medium: [] };

  it("accepts a valid file", () => {
    expect(parseRecordedVoices(valid).voices).toHaveLength(1);
  });

  it("rejects an http licence link", () => {
    const bad = structuredClone(valid);
    bad.voices[0]!.model.licence.url = "http://example.com/licence";
    expect(() => parseRecordedVoices(bad)).toThrow(/licence\.url must be an https URL/);
  });

  it.each(["2026-10-30", "2026-02-31T10:00:00Z", "2026-10-30T10:00:00+02:00", "yesterday"])(
    "rejects the recording date %s",
    (date) => {
      const bad = structuredClone(valid);
      bad.voices[0]!.recordedAt = date;
      expect(() => parseRecordedVoices(bad)).toThrow(/recordedAt/);
    },
  );

  it("rejects missing metadata, empty answers, bad languages and duplicates", () => {
    const noDigest = structuredClone(valid) as { voices: { model: Record<string, unknown> }[] };
    delete noDigest.voices[0]!.model["digest"];
    expect(() => parseRecordedVoices(noDigest)).toThrow(/digest/);
    expect(() => parseRecordedVoices({ ...valid, voices: [{ ...voice, answer: "  " }] })).toThrow(
      /answer/,
    );
    expect(() => parseRecordedVoices({ ...valid, voices: [{ ...voice, language: "fr" }] })).toThrow(
      /language/,
    );
    expect(() => parseRecordedVoices({ ...valid, voices: [voice, voice] })).toThrow(/duplicate/);
    expect(() => parseRecordedVoices({ ...valid, schemaVersion: 2 })).toThrow(/schemaVersion/);
  });

  it("never writes an invalid file: serialisation validates first", () => {
    expect(() => serializeRecordedVoices({ schemaVersion: 1, voices: [{}], medium: [] })).toThrow();
  });
});

describe("client hardening", () => {
  const opts = { temperature: 0, seed: 42, numPredict: 120 };

  it("sends every request with redirect: error and a timeout signal", async () => {
    const seen: RequestInit[] = [];
    const fetchFn = (_url: string, init?: RequestInit): Promise<Response> => {
      seen.push(init ?? {});
      return Promise.resolve(
        new Response(JSON.stringify({ version: "1", models: [], done: true, response: "x" })),
      );
    };
    const client = new OllamaClient("http://127.0.0.1:11434", fetchFn);
    await client.version();
    await client.digests();
    await client.generate("m", "p", opts);
    expect(seen).toHaveLength(3);
    for (const init of seen) {
      expect(init.redirect).toBe("error");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("maps a timeout to OllamaUnreachableError", async () => {
    const hang = (_url: string, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("timed out", "TimeoutError")),
        );
      });
    const client = new OllamaClient("http://127.0.0.1:11434", hang, {
      generateMs: 20,
      quickMs: 20,
    });
    await expect(client.version()).rejects.toBeInstanceOf(OllamaUnreachableError);
    await expect(client.generate("m", "p", opts)).rejects.toThrow(/within \d+ s/);
  });

  it("reports bad JSON clearly", async () => {
    const client = new OllamaClient("http://127.0.0.1:11434", () =>
      Promise.resolve(new Response("<html>nope</html>")),
    );
    await expect(client.version()).rejects.toThrow(/did not return valid JSON/);
  });
});

describe("re-runs, failures and stale ids", () => {
  it("keeps unchanged entries byte-identical on a re-run at a later time", async () => {
    fake = await startFakeOllama({ "gemma:2b": DIGEST_A });
    const first = await recordVoices(configFor(fake.url), emptyRecordedVoices(), {
      readText,
      now: fixedNow,
    });
    const calls = fake.requests.filter((r) => r.path === "/api/generate").length;
    const second = await recordVoices(configFor(fake.url), first.file, {
      readText,
      now: () => new Date("2027-01-01T00:00:00.000Z"),
    });
    expect(serializeRecordedVoices(second.file)).toBe(serializeRecordedVoices(first.file));
    expect(fake.requests.filter((r) => r.path === "/api/generate")).toHaveLength(calls);
  });

  it("re-records when the digest, the settings or the question text changed", async () => {
    fake = await startFakeOllama({ "gemma:2b": DIGEST_A });
    const first = await recordVoices(configFor(fake.url), emptyRecordedVoices(), {
      readText,
      now: fixedNow,
    });
    const later = (): Date => new Date("2027-01-01T00:00:00.000Z");
    const config = configFor(fake.url);
    const reseeded = await recordVoices(
      { ...config, generation: { ...config.generation, seed: 7 } },
      first.file,
      { readText, now: later },
    );
    expect(reseeded.file.voices[0]?.recordedAt).toBe("2027-01-01T00:00:00.000Z");
    await fake.close();
    fake = await startFakeOllama({ "gemma:2b": DIGEST_B });
    const newDigest = await recordVoices(configFor(fake.url), first.file, { readText, now: later });
    expect(newDigest.file.voices[0]?.model.digest).toBe(DIGEST_B);
    const edited = JSON.parse(files["public/data/offered-questions.json"] ?? "") as {
      questions: { id: string; en: string }[];
    };
    edited.questions[0]!.en = "What is left when we go?";
    const changed = await recordVoices(configFor(fake.url), newDigest.file, {
      readText: (path) =>
        path === "public/data/offered-questions.json" ? JSON.stringify(edited) : readText(path),
      now: later,
    });
    expect(changed.file.voices[0]?.answer).toContain("What is left when we go?");
  });

  it("a failing ancestor does not lose the run: others are written, earlier data kept", async () => {
    fake = await startFakeOllama({ "gemma:2b": DIGEST_A, "gemma2:2b": DIGEST_A });
    const first = await recordVoices(configFor(fake.url), emptyRecordedVoices(), {
      readText,
      now: fixedNow,
    });
    const flaky = async (url: string, init?: RequestInit): Promise<Response> => {
      const body = typeof init?.body === "string" ? init.body : "";
      if (body.includes('"gemma2:2b"')) return new Response("{}", { status: 500 });
      return fetch(url, init);
    };
    const config = configFor(fake.url);
    const reseeded = { ...config, generation: { ...config.generation, seed: 9 } };
    const second = await recordVoices(reseeded, first.file, {
      readText,
      now: () => new Date("2027-01-01T00:00:00.000Z"),
      fetch: flaky,
    });
    expect(second.failures).toHaveLength(1);
    expect(second.failures[0]).toMatch(/^gemma-2: .*HTTP 500/);
    const gemma1 = second.file.voices.filter((v) => v.ancestorId === "gemma-1");
    expect(gemma1.every((v) => v.settings.seed === 9)).toBe(true);
    const gemma2 = second.file.voices.filter((v) => v.ancestorId === "gemma-2");
    expect(gemma2).toEqual(first.file.voices.filter((v) => v.ancestorId === "gemma-2"));
    expect(gemma2).toHaveLength(12);
  });

  it("refuses unverified tags without allowUnverified", async () => {
    await expect(
      recordVoicesStrict(configFor("http://127.0.0.1:11434"), emptyRecordedVoices(), {
        readText,
      }),
    ).rejects.toThrow(/--allow-unverified/);
  });

  it("drops earlier entries whose ancestor or question no longer exists", async () => {
    fake = await startFakeOllama({ "gemma:2b": DIGEST_A });
    const first = await recordVoices(configFor(fake.url), emptyRecordedVoices(), {
      readText,
      now: fixedNow,
    });
    const stale = {
      ...first.file,
      voices: [
        ...first.file.voices,
        { ...first.file.voices[0]!, ancestorId: "gemma-9" },
        { ...first.file.voices[0]!, questionId: "gone" },
      ],
    };
    const { file } = await recordVoices(configFor(fake.url), stale, { readText, now: fixedNow });
    expect(file.voices).toHaveLength(12);
  });

  it("assertKnownIds rejects unknown ancestor and question ids", () => {
    const questions = parseOfferedQuestions(
      JSON.parse(shippedText("public/data/offered-questions.json")),
    ).map((q) => q.id);
    const ancestors = parseAncestors(JSON.parse(shippedText("public/data/ancestors.json"))).map(
      (a) => a.id,
    );
    const known = { ancestorIds: ancestors, questionIds: questions };
    expect(() =>
      assertKnownIds(
        parseRecordedVoices(JSON.parse(shippedText("public/data/recorded-voices.json"))),
        known,
      ),
    ).not.toThrow();
    const voice = {
      ancestorId: "gemma-1",
      questionId: "love-poem",
      questionText: "Write a love poem.",
      language: "en",
      answer: "Roses.",
      model: {
        name: "Gemma 1",
        tag: "gemma:2b",
        digest: DIGEST_A,
        licence: { name: "Gemma Terms of Use", url: "https://ai.google.dev/gemma/terms" },
      },
      settings: { temperature: 0, seed: 42, numPredict: 120 },
      recordedAt: "2026-10-30T10:00:00.000Z",
      runtime: { name: "ollama", version: "0.12.3" },
    };
    const make = (patch: object) =>
      parseRecordedVoices({ schemaVersion: 1, voices: [{ ...voice, ...patch }], medium: [] });
    expect(() => assertKnownIds(make({}), known)).not.toThrow();
    expect(() => assertKnownIds(make({ ancestorId: "pythia" }), known)).toThrow(
      /ancestorId is unknown/,
    );
    expect(() => assertKnownIds(make({ questionId: "gone" }), known)).toThrow(
      /questionId is unknown/,
    );
  });
});

describe("command line", () => {
  it("parses --config and --allow-unverified", () => {
    expect(parseArgs(["--config", "x.json", "--allow-unverified"])).toEqual({
      configPath: "x.json",
      allowUnverified: true,
    });
    expect(parseArgs([])).toEqual({ configPath: undefined, allowUnverified: false });
  });

  it("rejects --config without a value and unknown flags", () => {
    expect(() => parseArgs(["--config"])).toThrow(/needs a path/);
    expect(() => parseArgs(["--config", "--allow-unverified"])).toThrow(/needs a path/);
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});
