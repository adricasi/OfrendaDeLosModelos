import { describe, expect, it } from "vitest";

import { CACHE_PREFIX } from "../src/sw/constants.js";
import { buildPrecacheManifest } from "../src/sw/precache.js";
import { registerOfflineShell } from "../src/sw/register.js";
import { routeRequest, staleCaches } from "../src/sw/routing.js";

const ORIGIN = "https://adricasi.github.io";
const SCOPE = `${ORIGIN}/OfrendaDeLosModelos/`;
const PRECACHED: ReadonlySet<string> = new Set([
  "index.html",
  "assets/index-abc.js",
  "data/ancestors.json",
  "ort/ort-wasm-simd-threaded.asyncify.wasm",
]);

function route(url: string, mode = "cors", method = "GET") {
  return routeRequest({ method, url, mode }, SCOPE, PRECACHED);
}

describe("precache manifest (REQ-011)", () => {
  const files = [
    { path: "index.html", content: "<html></html>" },
    { path: "assets/index-abc.js", content: "console.log(1)" },
    { path: "data/ancestors.json", content: new TextEncoder().encode("[]") },
    { path: "sw.js", content: "the worker itself" },
    { path: "assets/index-abc.js.map", content: "{}" },
  ];

  it("lists every file once, sorted, without the worker and source maps", () => {
    const manifest = buildPrecacheManifest(files);
    expect(manifest.entries).toEqual(["assets/index-abc.js", "data/ancestors.json", "index.html"]);
  });

  it("derives a versioned cache name from the contents, whatever the order", () => {
    const manifest = buildPrecacheManifest(files);
    expect(manifest.cacheName).toBe(`${CACHE_PREFIX}${manifest.version}`);
    expect(buildPrecacheManifest([...files].reverse())).toEqual(manifest);
    const changed = files.map((f) =>
      f.path === "index.html" ? { ...f, content: "<html>new</html>" } : f,
    );
    expect(buildPrecacheManifest(changed).cacheName).not.toBe(manifest.cacheName);
    // The worker's own text does not change the version.
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
    expect(route(`${SCOPE}elsewhere`, "navigate")).toBe("ignore");
  });

  it("serves manifest files cache first", () => {
    expect(route(`${SCOPE}assets/index-abc.js`, "no-cors")).toBe("precached");
    expect(route(`${SCOPE}data/ancestors.json`)).toBe("precached");
    expect(route(`${SCOPE}ort/ort-wasm-simd-threaded.asyncify.wasm`)).toBe("precached");
  });

  it("never touches cross-origin requests, such as model downloads", () => {
    expect(route("https://huggingface.co/onnx-community/x/resolve/main/model.onnx")).toBe("ignore");
    expect(route("https://huggingface.co/OfrendaDeLosModelos/assets/index-abc.js")).toBe("ignore");
    expect(route(`https://evil.example${new URL(SCOPE).pathname}index.html`, "navigate")).toBe(
      "ignore",
    );
    expect(route("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/x.wasm")).toBe("ignore");
  });

  it("never touches anything that is not a plain GET of a known file", () => {
    expect(route(`${SCOPE}data/ancestors.json`, "cors", "POST")).toBe("ignore");
    // A query string (where visitor input could ever be) is never served or stored.
    expect(route(`${SCOPE}data/ancestors.json?q=my+question`)).toBe("ignore");
    expect(route(`${SCOPE}data/unknown.json`)).toBe("ignore");
    expect(route(`${ORIGIN}/other-site/assets/index-abc.js`)).toBe("ignore");
  });

  it("deletes only this worker's caches from earlier builds", () => {
    const current = `${CACHE_PREFIX}new`;
    expect(
      staleCaches([`${CACHE_PREFIX}old`, current, "transformers-cache", "other"], current),
    ).toEqual([`${CACHE_PREFIX}old`]);
  });
});

describe("registration (REQ-011)", () => {
  function container(register: (url: string, options: unknown) => Promise<unknown>) {
    return { register, ready: Promise.resolve({}) } as unknown as ServiceWorkerContainer;
  }
  const base = {
    base: "/OfrendaDeLosModelos/",
    origin: ORIGIN,
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
    expect(calls).toEqual([[`${SCOPE}sw.js`, { scope: "/OfrendaDeLosModelos/" }]]);
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
