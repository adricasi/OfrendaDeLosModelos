// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { startAltar } from "../src/app.js";
import { createFakeWorker } from "../src/fake/fake-worker.js";
import {
  BUSY_MESSAGE,
  MODEL_CACHE_NAME,
  formatStoredSize,
  forgetModels,
  storedModelBytes,
  wireStoredModels,
  type CacheStorageLike,
} from "../src/ui/stored-models.js";
import { loadTestData, mountPage, settle } from "./helpers.js";

interface FakeEntry {
  readonly url: string;
  readonly contentLength?: number;
  readonly body?: string;
}

/** An in-memory Cache API: named caches of entries, with a log of what was deleted. */
function fakeStorage(initial: Record<string, FakeEntry[]>): CacheStorageLike & {
  readonly names: () => string[];
  readonly deleted: string[];
} {
  const caches = new Map(Object.entries(initial));
  const deleted: string[] = [];
  const entryResponse = (entry: FakeEntry): Response => {
    const headers = new Headers();
    if (entry.contentLength !== undefined)
      headers.set("Content-Length", String(entry.contentLength));
    return new Response(entry.body ?? "", { headers });
  };
  return {
    names: () => [...caches.keys()],
    deleted,
    has: (name) => Promise.resolve(caches.has(name)),
    delete: (name) => {
      deleted.push(name);
      return Promise.resolve(caches.delete(name));
    },
    open: (name) => {
      const entries = caches.get(name) ?? [];
      return Promise.resolve({
        keys: () => Promise.resolve(entries.map((entry) => new Request(entry.url))),
        match: (request: Request) => {
          const entry = entries.find((e) => e.url === request.url);
          return Promise.resolve(entry === undefined ? undefined : entryResponse(entry));
        },
      });
    },
  };
}

const MODEL_FILES: FakeEntry[] = [
  { url: "https://huggingface.co/a/model.onnx", contentLength: 1_500_000_000 },
  { url: "https://huggingface.co/b/model.onnx", contentLength: 400_000_000 },
  { url: "https://huggingface.co/c/tokenizer.json", body: "x".repeat(1000) },
];
const SHELL = [{ url: "https://example.test/index.html", contentLength: 5000 }];

const text = (id: string): string => document.getElementById(id)?.textContent ?? "";
const button = (): HTMLButtonElement => {
  const element = document.getElementById("stored-models-forget");
  if (!(element instanceof HTMLButtonElement)) throw new Error("no button");
  return element;
};

describe("formatting and measuring the stored models (AC-011.2)", () => {
  it("formats GB, MB and tiny sizes", () => {
    expect(formatStoredSize(1_900_000_000)).toBe("1.9 GB");
    expect(formatStoredSize(480_000_000)).toBe("480 MB");
    expect(formatStoredSize(1000)).toBe("less than 1 MB");
  });

  it("sums Content-Length headers and falls back to the body size", async () => {
    const storage = fakeStorage({ [MODEL_CACHE_NAME]: MODEL_FILES });
    expect(await storedModelBytes(storage)).toBe(1_900_001_000);
  });

  it("is 0 when the cache does not exist or is empty", async () => {
    expect(await storedModelBytes(fakeStorage({}))).toBe(0);
    expect(await storedModelBytes(fakeStorage({ [MODEL_CACHE_NAME]: [] }))).toBe(0);
  });

  it("deletes only the transformers cache and reports its size", async () => {
    const storage = fakeStorage({
      [MODEL_CACHE_NAME]: MODEL_FILES,
      "ofrenda-shell-abc": SHELL,
    });
    const result = await forgetModels(storage);
    expect(result).toEqual({ bytes: 1_900_001_000, removed: true });
    expect(storage.deleted).toEqual([MODEL_CACHE_NAME]);
    expect(storage.names()).toEqual(["ofrenda-shell-abc"]);
  });
});

describe("the about panel section", () => {
  beforeEach(() => {
    mountPage();
  });

  it("shows the size, then reports what was removed in a polite live region", async () => {
    const storage = fakeStorage({ [MODEL_CACHE_NAME]: MODEL_FILES, "ofrenda-shell-abc": SHELL });
    wireStoredModels(document, storage);
    await settle(2);
    expect(text("stored-models-status")).toBe("Stored now: about 1.9 GB.");
    const live = document.getElementById("stored-models-result");
    expect(live?.getAttribute("aria-live")).toBe("polite");
    button().click();
    await settle(3);
    expect(text("stored-models-result")).toBe("Removed about 1.9 GB.");
    expect(text("stored-models-status")).toBe("Nothing stored.");
    expect(storage.names()).toEqual(["ofrenda-shell-abc"]);
  });

  it("says there is nothing to remove when nothing is stored", async () => {
    wireStoredModels(document, fakeStorage({}));
    await settle(2);
    expect(text("stored-models-status")).toBe("Nothing stored.");
    button().click();
    await settle(3);
    expect(text("stored-models-result")).toBe("Nothing to remove.");
  });

  it("shows an error when deleting fails", async () => {
    const storage = fakeStorage({ [MODEL_CACHE_NAME]: MODEL_FILES });
    wireStoredModels(document, { ...storage, delete: () => Promise.reject(new Error("quota")) });
    await settle(2);
    button().click();
    await settle(3);
    expect(text("stored-models-result")).toBe("The models could not be removed: quota");
    expect(button().disabled).toBe(false);
  });

  it("says so when the size cannot be measured", async () => {
    const storage = fakeStorage({ [MODEL_CACHE_NAME]: MODEL_FILES });
    wireStoredModels(document, { ...storage, has: () => Promise.reject(new Error("denied")) });
    await settle(2);
    expect(text("stored-models-status")).toBe("The space they use could not be measured.");
  });

  it("handles a browser without the Cache API", async () => {
    wireStoredModels(document, undefined);
    await settle(2);
    expect(text("stored-models-status")).toContain("does not let this page see");
    button().click();
    await settle(2);
    expect(text("stored-models-result")).toContain("could not be removed");
  });

  it("is disabled, with the reason, while busy, and deletes nothing if clicked", async () => {
    const storage = fakeStorage({ [MODEL_CACHE_NAME]: MODEL_FILES });
    const panel = wireStoredModels(document, storage);
    await settle(2);
    panel.setBusy(true);
    expect(button().disabled).toBe(true);
    expect(text("stored-models-note")).toBe(BUSY_MESSAGE);
    button().click();
    await settle(2);
    expect(storage.deleted).toEqual([]);
    panel.setBusy(false);
    expect(button().disabled).toBe(false);
    expect(text("stored-models-note")).toBe("");
  });

  it("is disabled while a ritual runs and enabled again when it ends", async () => {
    const storage = fakeStorage({ [MODEL_CACHE_NAME]: MODEL_FILES });
    startAltar(
      document,
      await loadTestData(),
      {
        worker: createFakeWorker({ wordsFor: () => ["fine"] }),
        recorded: { lookup: () => ({ text: "recorded", credit: "credit" }) },
        includeMedium: false,
      },
      undefined,
      storage,
    );
    const radio = document.querySelector<HTMLInputElement>('input[name="question"]');
    if (radio === null) throw new Error("no radio");
    radio.checked = true;
    document
      .getElementById("offering-form")
      ?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(button().disabled).toBe(true);
    expect(text("stored-models-note")).toBe(BUSY_MESSAGE);
    for (let i = 0; i < 200 && button().disabled; i += 1) await settle();
    expect(button().disabled).toBe(false);
  });
});
