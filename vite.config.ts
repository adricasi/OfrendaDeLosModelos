import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

import { defineConfig, type Plugin } from "vite";

import { SERVICE_WORKER_FILE } from "./src/sw/constants.js";
import { buildPrecacheManifest, type PrecacheFile } from "./src/sw/precache.js";

const BASE = "/OfrendaDeLosModelos/";

/**
 * The CSP meta tag in index.html is meant for production. Vite's dev server injects its
 * styles as inline <style> elements, which `style-src 'self'` blocks, so dev serves the page
 * without the CSP. The production build keeps it (see test/page-policy.test.ts).
 */
function stripCspInDev(): Plugin {
  return {
    name: "strip-csp-in-dev",
    apply: "serve",
    transformIndexHtml(html) {
      return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/s, "");
    },
  };
}

/** The ONNX Runtime WebAssembly build transformers.js 4.3.1 loads (src/backends/onnx.js). */
export const ORT_FILES = [
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
] as const;

function ortDirectory(): string {
  // onnxruntime-web is the dependency of @huggingface/transformers that ships the .wasm files;
  // its main entry lives in the same dist/ folder.
  return dirname(createRequire(import.meta.url).resolve("onnxruntime-web"));
}

/**
 * Self-hosts ONNX Runtime's WebAssembly files (no jsDelivr, NFR-001): they are copied from
 * node_modules into `ort/` of the output, and served from there by the dev server. The worker
 * points `env.backends.onnx.wasm.wasmPaths` at this folder.
 */
function selfHostOrt(): Plugin {
  const directory = ortDirectory();
  const prefix = `${BASE}ort/`;
  return {
    name: "self-host-ort",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split("?")[0] ?? "";
        const file = ORT_FILES.find((name) => url === `${prefix}${name}`);
        if (file === undefined) {
          next();
          return;
        }
        response.setHeader(
          "Content-Type",
          file.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        );
        response.end(readFileSync(join(directory, file)));
      });
    },
    generateBundle() {
      for (const file of ORT_FILES) {
        this.emitFile({
          type: "asset",
          fileName: `ort/${file}`,
          source: readFileSync(join(directory, file)),
        });
      }
    },
  };
}

/**
 * transformers.js falls back to a jsDelivr URL for ONNX Runtime's files when `wasmPaths` is not
 * set (src/backends/onnx.js). The worker sets it, but the build also rewrites that fallback to
 * the site's own `ort/` folder, so no CDN address is left in the bundle (NFR-001) and a future
 * library change cannot silently bring the CDN back: the build fails if the pattern is gone.
 * ONNX Runtime also references its .wasm through `new URL(...)`, which Vite would copy into
 * assets/ a second time; that unused copy is dropped.
 */
function noCdnForOrt(): Plugin {
  const fallback = "https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_ENV.versions.web}/dist/";
  return {
    name: "no-cdn-for-ort",
    enforce: "pre",
    transform(code, id) {
      if (!code.includes("cdn.jsdelivr.net")) return null;
      if (!code.includes(fallback)) {
        this.error(`${id} mentions cdn.jsdelivr.net in a form this build does not rewrite.`);
      }
      return { code: code.replaceAll(fallback, `${BASE}ort/`), map: null };
    },
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/^assets\/ort-wasm.*\.wasm$/.test(name)) Reflect.deleteProperty(bundle, name);
      }
    },
  };
}

/**
 * Hosts that may appear as URLs in the built code (NFR-001). A new host must be added here on
 * purpose. The files in public/data are copied as they are, not bundled, so the source links in
 * the credits and dark frames are not checked here (their validators require https).
 */
export const ALLOWED_BUNDLE_HOSTS: readonly string[] = [
  "huggingface.co", // models; the T-001 report adds the download CDN hosts here and in the CSP
  "www.w3.org", // XML and SVG namespace identifiers: names, never fetched
  // Documentation links inside library error and warning messages and the bundler's runtime
  // comments (found in the transformers.js worker bundle on 2026-10-30): text, never fetched.
  "rolldown.rs",
  "web.dev",
  "developer.mozilla.org",
  "github.com",
  "gist.github.com",
];

/** Fails the build when the bundle mentions an http(s) host outside the allowlist. */
function checkBundleHosts(): Plugin {
  return {
    name: "check-bundle-hosts",
    generateBundle(_options, bundle) {
      const unexpected = new Map<string, string>();
      for (const [name, item] of Object.entries(bundle)) {
        const text =
          item.type === "chunk" ? item.code : typeof item.source === "string" ? item.source : "";
        if (text === "" || name.endsWith(".wasm")) continue;
        for (const match of text.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
          const host = (match[1] ?? "").toLowerCase();
          if (!ALLOWED_BUNDLE_HOSTS.includes(host)) unexpected.set(host, name);
        }
      }
      if (unexpected.size > 0) {
        const list = [...unexpected].map(([host, file]) => `${host} (in ${file})`).join(", ");
        this.error(
          `The build mentions hosts that are not allowed: ${list}. Add a host to ALLOWED_BUNDLE_HOSTS only on purpose.`,
        );
      }
    },
  };
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/**
 * Offline shell (T-008, REQ-011). `src/sw/sw.ts` is built as a second entry named `sw.js` (no
 * hash: the browser must find the same URL again to update it). Once every other file is known,
 * this plugin lists them (the page, the hashed JS and CSS, the self-hosted ONNX Runtime files)
 * plus everything in public/ (the data files), and writes that list, with a version derived from
 * the files' contents, into the service worker where it says `__PRECACHE__`.
 */
function offlineShell(): Plugin {
  let publicDirectory = "";
  return {
    name: "offline-shell",
    enforce: "post",
    apply: "build",
    configResolved(config) {
      publicDirectory = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const files: PrecacheFile[] = [];
      for (const [name, item] of Object.entries(bundle)) {
        if (name === SERVICE_WORKER_FILE) continue;
        files.push({ path: name, content: item.type === "chunk" ? item.code : item.source });
      }
      if (publicDirectory !== "") {
        for (const path of filesUnder(publicDirectory)) {
          const name = relative(publicDirectory, path).split(sep).join("/");
          if (!(name in bundle)) files.push({ path: name, content: readFileSync(path) });
        }
      }
      const manifest = buildPrecacheManifest(files);
      const worker = bundle[SERVICE_WORKER_FILE];
      if (worker?.type !== "chunk") {
        this.error(`The build has no ${SERVICE_WORKER_FILE} entry (src/sw/sw.ts).`);
      }
      if (!worker.code.includes("__PRECACHE__")) {
        this.error("The service worker has no __PRECACHE__ placeholder to fill.");
      }
      if (/^\s*(import|export)\b/m.test(worker.code)) {
        this.error("sw.js must be one self-contained classic script (no import or export).");
      }
      const literal = JSON.stringify({ cacheName: manifest.cacheName, entries: manifest.entries });
      worker.code = worker.code.replaceAll("__PRECACHE__", literal);
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [stripCspInDev(), selfHostOrt(), noCdnForOrt(), checkBundleHosts(), offlineShell()],
  // The inference worker is a module worker (new Worker(url, { type: "module" })).
  worker: { format: "es", plugins: () => [noCdnForOrt(), checkBundleHosts()] },
  build: {
    target: "es2023",
    // Chrome and Edge support modulepreload natively; no injected polyfill code.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { index: resolve("index.html"), sw: resolve("src/sw/sw.ts") },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "sw" ? SERVICE_WORKER_FILE : "assets/[name]-[hash].js",
      },
    },
  },
});
