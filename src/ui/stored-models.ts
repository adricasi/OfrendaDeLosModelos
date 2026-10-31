/** The cache transformers.js (4.3.1, `env.cacheKey`) keeps model files in; the runtime does not override it. */
export const MODEL_CACHE_NAME = "transformers-cache";

/** The part of the Cache API this module uses, so tests can fake it. */
export interface CacheStorageLike {
  has(name: string): Promise<boolean>;
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}

export interface CacheLike {
  keys(): Promise<readonly Request[]>;
  match(request: Request): Promise<Response | undefined>;
}

export const BUSY_MESSAGE = "A ritual is running. You can forget the models when it ends.";
export const UNAVAILABLE_MESSAGE = "Your browser does not let this page see what is stored.";
const NOTHING_STORED = "Nothing stored.";
const NOTHING_TO_REMOVE = "Nothing to remove.";

/** "1.9 GB", "480 MB" or "less than 1 MB". */
export function formatStoredSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${String(Math.round(bytes / 1_000_000))} MB`;
  return "less than 1 MB";
}

async function entrySize(response: Response): Promise<number> {
  const length = Number(response.headers.get("Content-Length"));
  if (response.headers.has("Content-Length") && Number.isFinite(length) && length >= 0) {
    return length;
  }
  return (await response.blob()).size;
}

/**
 * Bytes held in the model cache: the sum of its entries' `Content-Length`, or the size of the
 * body when a response has none. 0 when the cache does not exist.
 */
export async function storedModelBytes(storage: CacheStorageLike): Promise<number> {
  if (!(await storage.has(MODEL_CACHE_NAME))) return 0;
  const cache = await storage.open(MODEL_CACHE_NAME);
  let total = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (response !== undefined) total += await entrySize(response);
  }
  return total;
}

/** Deletes only the model cache (never the page shell's) and says how much it held. */
export async function forgetModels(
  storage: CacheStorageLike,
): Promise<{ readonly bytes: number; readonly removed: boolean }> {
  const bytes = await storedModelBytes(storage);
  const removed = await storage.delete(MODEL_CACHE_NAME);
  return { bytes, removed };
}

export interface StoredModelsPanel {
  /** While a ritual runs (or a model loads) the button is disabled and says why. */
  setBusy(busy: boolean): void;
  refresh(): Promise<void>;
}

function byId<T extends HTMLElement>(doc: Document, id: string, type: new () => T): T {
  const element = doc.getElementById(id);
  if (!(element instanceof type)) throw new Error(`index.html is missing #${id}`);
  return element;
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message !== "" ? error.message : "unknown error";
}

/** Wires the "Models stored in this browser" section of the about panel. Text only, never HTML. */
export function wireStoredModels(
  doc: Document,
  storage: CacheStorageLike | undefined,
): StoredModelsPanel {
  const status = byId(doc, "stored-models-status", HTMLElement);
  const button = byId(doc, "stored-models-forget", HTMLButtonElement);
  const note = byId(doc, "stored-models-note", HTMLElement);
  const result = byId(doc, "stored-models-result", HTMLElement);
  let busy = false;
  let working = false;

  const syncButton = (): void => {
    button.disabled = busy || working;
    note.textContent = busy ? BUSY_MESSAGE : "";
  };

  const refresh = async (): Promise<void> => {
    if (storage === undefined) {
      status.textContent = UNAVAILABLE_MESSAGE;
      return;
    }
    try {
      const bytes = await storedModelBytes(storage);
      status.textContent =
        bytes === 0 ? NOTHING_STORED : `Stored now: about ${formatStoredSize(bytes)}.`;
    } catch {
      status.textContent = "The space they use could not be measured.";
    }
  };

  button.addEventListener("click", () => {
    if (busy || working) return;
    result.textContent = "";
    if (storage === undefined) {
      result.textContent = `The models could not be removed: ${UNAVAILABLE_MESSAGE}`;
      return;
    }
    working = true;
    syncButton();
    forgetModels(storage)
      .then(({ bytes, removed }) => {
        result.textContent =
          removed && bytes > 0 ? `Removed about ${formatStoredSize(bytes)}.` : NOTHING_TO_REMOVE;
      })
      .catch((error: unknown) => {
        result.textContent = `The models could not be removed: ${describeError(error)}`;
      })
      .finally(() => {
        working = false;
        syncButton();
        void refresh();
      });
  });

  // The size is measured when the panel opens (see wireAboutPanel) and when a ritual ends.
  doc.getElementById("about")?.addEventListener("about-opened", () => {
    void refresh();
  });
  syncButton();
  void refresh();

  return {
    setBusy(value: boolean): void {
      busy = value;
      syncButton();
      if (!value) void refresh();
    },
    refresh,
  };
}
