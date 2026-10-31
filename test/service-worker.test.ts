import { describe, expect, it } from "vitest";

import { CACHE_PREFIX } from "../src/sw/constants.js";
import { buildPrecacheManifest, isContentHashed, type PrecacheFile } from "../src/sw/precache.js";
import { registerOfflineShell } from "../src/sw/register.js";
import { routeRequest, staleCaches, type FileKind } from "../src/sw/routing.js";
import {
  createShell,
  type CacheLike,
  type CachesLike,
  type Shell,
  type ShellManifest,
} from "../src/sw/shell.js";
import { knownScripts } from "../src/worker/trusted-worker.js";

const ORIGIN = "https://adricasi.github.io";
const BASE = "/OfrendaDeLosModelos/";
const SCOPE = `${ORIGIN}${BASE}`;
const FILES: ReadonlyMap<string, FileKind> = new Map([
  ["index.html", "unhashed"],
  ["assets/index-abcd1234.js", "hashed"],
  ["data/ancestors.json", "unhashed"],
  ["ort/ort-wasm-simd-threaded.asyncify.wasm", "unhashed"],
]);

function route(url: string, mode = "cors", method = "GET") {
  return routeRequest({ method, url, mode }, SCOPE, FILES);
}

describe("precache manifest (REQ-011)", () => {
  const files: PrecacheFile[] = [
    { path: "index.html", content: "<html></html>" },
    { path: "assets/index-abcd1234.js", content: "console.log(1)" },
    { path: "data/ancestors.json", content: new TextEncoder().encode("[]") },
    { path: "sw.js", content: "the worker itself" },
    { path: "assets/index-abcd1234.js.map", content: "{}" },
  ];

  it("lists every file once, sorted, without the worker and source maps", () => {
    const manifest = buildPrecacheManifest(files);
    expect(manifest.entries.map((e) => e.path)).toEqual([
      "assets/index-abcd1234.js",
      "data/ancestors.json",
      "index.html",
    ]);
    expect(manifest.entries.every((e) => /^[0-9a-f]{64}$/.test(e.digest))).toBe(true);
  });

  it("marks only content-hashed names as hashed", () => {
    expect(isContentHashed("assets/index-abcd1234.js")).toBe(true);
    expect(isContentHashed("assets/inference.worker-BNNR9_U_.js")).toBe(true);
    expect(isContentHashed("assets/index-eq1DM6Jm.css")).toBe(true);
    for (const path of ["index.html", "data/ancestors.json", "ort/ort-wasm.wasm", "assets/x.js"]) {
      expect(isContentHashed(path), path).toBe(false);
    }
    const flags = buildPrecacheManifest(files).entries.map((e) => [e.path, e.hashed]);
    expect(flags).toEqual([
      ["assets/index-abcd1234.js", true],
      ["data/ancestors.json", false],
      ["index.html", false],
    ]);
  });

  it("derives a versioned cache name from the contents, whatever the order", () => {
    const manifest = buildPrecacheManifest(files);
    expect(manifest.cacheName).toBe(`${CACHE_PREFIX}${manifest.version}`);
    expect(buildPrecacheManifest([...files].reverse())).toEqual(manifest);
    const changed = files.map((f) =>
      f.path === "data/ancestors.json" ? { ...f, content: "[1]" } : f,
    );
    expect(buildPrecacheManifest(changed).cacheName).not.toBe(manifest.cacheName);
    const other = files.map((f) => (f.path === "sw.js" ? { ...f, content: "other" } : f));
    expect(buildPrecacheManifest(other).cacheName).toBe(manifest.cacheName);
  });

  it("refuses a list without index.html and paths that are not relative to the base", () => {
    expect(() => buildPrecacheManifest([{ path: "a.js", content: "" }])).toThrow(/index\.html/);
    for (const path of ["/index.html", "../x.js", "a.js?v=1", ""]) {
      expect(() => buildPrecacheManifest([{ path, content: "" }])).toThrow(/relative/);
    }
  });
});

describe("fetch routing (REQ-011, NFR-002)", () => {
  it("serves page loads of the altar network first, with or without a query", () => {
    expect(route(SCOPE, "navigate")).toBe("navigation");
    expect(route(`${SCOPE}index.html`, "navigate")).toBe("navigation");
    expect(route(`${SCOPE}?fake-models`, "navigate")).toBe("navigation");
    expect(route(`${SCOPE}?debug`, "navigate")).toBe("navigation");
    expect(route(`${SCOPE}elsewhere`, "navigate")).toBe("ignore");
  });

  it("serves hashed files cache first and unhashed files network first", () => {
    expect(route(`${SCOPE}assets/index-abcd1234.js`, "no-cors")).toBe("cache-first");
    expect(route(`${SCOPE}data/ancestors.json`)).toBe("network-first");
    expect(route(`${SCOPE}ort/ort-wasm-simd-threaded.asyncify.wasm`)).toBe("network-first");
  });

  it("never touches cross-origin requests, such as model downloads", () => {
    expect(route("https://huggingface.co/onnx-community/x/resolve/main/model.onnx")).toBe("ignore");
    expect(route("https://huggingface.co/OfrendaDeLosModelos/assets/index-abcd1234.js")).toBe(
      "ignore",
    );
    expect(route(`https://evil.example${BASE}index.html`, "navigate")).toBe("ignore");
    expect(route("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/x.wasm")).toBe("ignore");
  });

  it("never touches anything that is not a plain GET of a known file", () => {
    expect(route(`${SCOPE}data/ancestors.json`, "cors", "POST")).toBe("ignore");
    expect(route(`${SCOPE}data/ancestors.json?q=my+question`)).toBe("ignore");
    expect(route(`${SCOPE}data/unknown.json`)).toBe("ignore");
    expect(route(`${ORIGIN}/other-site/assets/index-abcd1234.js`)).toBe("ignore");
  });

  it("deletes only this worker's caches from earlier builds", () => {
    const current = `${CACHE_PREFIX}new`;
    expect(
      staleCaches([`${CACHE_PREFIX}old`, current, "transformers-cache", "other"], current),
    ).toEqual([`${CACHE_PREFIX}old`]);
  });
});

/** In-memory Cache Storage and a network that serves one deployed build at a time. */
function environment() {
  type Stored = { body: string; headers: [string, string][] };
  const stores = new Map<string, Map<string, Stored>>();
  const cachesFake: CachesLike = {
    open(name): Promise<CacheLike> {
      const store = stores.get(name) ?? new Map<string, Stored>();
      stores.set(name, store);
      return Promise.resolve({
        match(url) {
          const found = store.get(url);
          return Promise.resolve(
            found === undefined ? undefined : new Response(found.body, { headers: found.headers }),
          );
        },
        async put(url, response) {
          store.set(url, { body: await response.text(), headers: [...response.headers] });
        },
      });
    },
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name) => Promise.resolve(stores.delete(name)),
  };
  const network = {
    online: true,
    deployed: new Map<string, string>(),
    broken: new Set<string>(),
    requests: [] as string[],
  };
  const fetchFake = (url: string): Promise<Response> => {
    network.requests.push(url);
    if (!network.online) return Promise.reject(new TypeError("offline"));
    const path = url.slice(SCOPE.length).split("?")[0] ?? "";
    const body = network.deployed.get(path === "" ? "index.html" : path);
    if (body === undefined || network.broken.has(path)) {
      return Promise.resolve(new Response("nope", { status: body === undefined ? 404 : 500 }));
    }
    return Promise.resolve(new Response(body));
  };
  const logged: string[] = [];
  function shellFor(manifest: ShellManifest): Shell {
    return createShell({
      manifest,
      scope: SCOPE,
      caches: cachesFake,
      fetch: fetchFake,
      log: (message) => logged.push(message),
    });
  }
  return { stores, network, logged, shellFor };
}

function build(version: string, data: string): Map<string, string> {
  return new Map([
    ["index.html", `page ${version} -> assets/app-${version.padEnd(8, "0")}.js`],
    [`assets/app-${version.padEnd(8, "0")}.js`, `code ${version}`],
    ["data/ancestors.json", data],
    ["ort/runtime.wasm", "the same ONNX Runtime"],
  ]);
}

function manifestOf(files: Map<string, string>): ShellManifest {
  const { cacheName, entries } = buildPrecacheManifest(
    [...files].map(([path, content]) => ({ path, content })),
  );
  return { cacheName, entries };
}

async function get(shell: Shell, path: string, mode = "cors"): Promise<string | null> {
  const response = shell.handle({ method: "GET", url: `${SCOPE}${path}`, mode });
  return response === null ? null : (await response).text();
}

describe("a deploy while visitors still have the old build (version skew)", () => {
  it("never pairs the new page with old data, online or offline", async () => {
    const env = environment();
    const buildA = build("A", "data A");
    const buildB = build("B", "data B");
    const shellA = env.shellFor(manifestOf(buildA));
    env.network.deployed = buildA;
    await shellA.install();
    await shellA.activate();
    expect(await get(shellA, "", "navigate")).toBe("page A -> assets/app-A0000000.js");

    // Build B goes live; the visitor's worker is still A's.
    env.network.deployed = buildB;
    expect(await get(shellA, "", "navigate")).toBe("page B -> assets/app-B0000000.js");
    expect(await get(shellA, "data/ancestors.json")).toBe("data B");
    // B's hashed file is not in A's manifest: not touched, so the browser asks the network.
    expect(await get(shellA, "assets/app-B0000000.js", "no-cors")).toBeNull();

    // Offline with A's worker: all of it is still build A.
    env.network.online = false;
    expect(await get(shellA, "", "navigate")).toBe("page A -> assets/app-A0000000.js");
    expect(await get(shellA, "data/ancestors.json")).toBe("data A");
    expect(await get(shellA, "assets/app-A0000000.js", "no-cors")).toBe("code A");
  });

  it("installs build B copying unchanged files, then serves only build B", async () => {
    const env = environment();
    const buildA = build("A", "data A");
    const buildB = build("B", "data B");
    env.network.deployed = buildA;
    const shellA = env.shellFor(manifestOf(buildA));
    await shellA.install();
    await shellA.activate();

    env.network.deployed = buildB;
    env.network.requests.length = 0;
    const shellB = env.shellFor(manifestOf(buildB));
    await shellB.install();
    await shellB.activate();
    // The unchanged ONNX Runtime file was copied, not downloaded again.
    expect(env.network.requests.some((url) => url.endsWith("ort/runtime.wasm"))).toBe(false);
    expect(env.network.requests.some((url) => url.endsWith("data/ancestors.json"))).toBe(true);
    expect([...env.stores.keys()]).toEqual([manifestOf(buildB).cacheName]);

    env.network.online = false;
    expect(await get(shellB, "", "navigate")).toBe("page B -> assets/app-B0000000.js");
    expect(await get(shellB, "data/ancestors.json")).toBe("data B");
    expect(await get(shellB, "assets/app-B0000000.js", "no-cors")).toBe("code B");
    expect(await get(shellB, "ort/runtime.wasm")).toBe("the same ONNX Runtime");
  });

  it("a failed install is logged, leaves no half cache, and the old worker stays correct", async () => {
    const env = environment();
    const buildA = build("A", "data A");
    const buildB = build("B", "data B");
    env.network.deployed = buildA;
    const shellA = env.shellFor(manifestOf(buildA));
    await shellA.install();
    await shellA.activate();

    env.network.deployed = buildB;
    env.network.broken.add("assets/app-B0000000.js");
    const shellB = env.shellFor(manifestOf(buildB));
    await expect(shellB.install()).rejects.toThrow(/app-B0000000/);
    expect(env.logged.join(" ")).toContain("app-B0000000");
    expect([...env.stores.keys()]).toEqual([manifestOf(buildA).cacheName]);

    // The old worker keeps serving, and online it still shows build B's data with build B's page.
    expect(await get(shellA, "", "navigate")).toBe("page B -> assets/app-B0000000.js");
    expect(await get(shellA, "data/ancestors.json")).toBe("data B");
  });
});

describe("registration (REQ-011)", () => {
  function container(register: (url: string, options: unknown) => Promise<unknown>) {
    return { register, ready: Promise.resolve({}) } as unknown as ServiceWorkerContainer;
  }
  const base = {
    base: BASE,
    known: knownScripts(`${BASE}assets/inference.worker-abc12345.js`, BASE, ORIGIN),
    production: true,
    secureContext: true,
  };

  it("registers sw.js with the base as scope and reports readiness", async () => {
    const calls: unknown[][] = [];
    const ready = await registerOfflineShell({
      ...base,
      serviceWorker: container((...args) => {
        calls.push(args);
        return Promise.resolve({});
      }),
    });
    expect(ready).toBe(true);
    expect(calls).toEqual([[`${SCOPE}sw.js`, { scope: BASE }]]);
  });

  it("does nothing in dev builds, insecure contexts or browsers without service workers", async () => {
    const never = container(() => Promise.reject(new Error("must not register")));
    expect(await registerOfflineShell({ ...base, serviceWorker: never, production: false })).toBe(
      false,
    );
    expect(
      await registerOfflineShell({ ...base, serviceWorker: never, secureContext: false }),
    ).toBe(false);
    expect(await registerOfflineShell({ ...base, serviceWorker: undefined })).toBe(false);
  });

  it("reports a failed registration instead of throwing", async () => {
    const logged: string[] = [];
    const ready = await registerOfflineShell({
      ...base,
      serviceWorker: container(() => Promise.reject(new Error("blocked"))),
      log: (message) => logged.push(message),
    });
    expect(ready).toBe(false);
    expect(logged).toHaveLength(1);
  });
});
