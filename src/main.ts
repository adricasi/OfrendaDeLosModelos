import { createProductionDependencies, startAltar } from "./app.js";
import { loadAltarData } from "./data/load.js";
import { debugRequested } from "./debug/debug-log.js";
import { detectWebGpu } from "./ritual/gpu.js";
import { registerOfflineShell } from "./sw/register.js";
import { showLoadError, showOfflineNote, wireAboutPanel } from "./ui/altar.js";

function pageLoaded(): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    window.addEventListener(
      "load",
      () => {
        resolve();
      },
      { once: true },
    );
  });
}

async function main(): Promise<void> {
  let data = await loadAltarData(import.meta.env.BASE_URL);
  // `import.meta.env.DEV` is true only when the dev server runs (and in a build only if
  // NODE_ENV is set to something other than production); requiring the "development" mode as
  // well means a mis-set NODE_ENV alone cannot switch the override on. Both comparisons are
  // folded to `false` in the production build, which drops the override code.
  if (import.meta.env.DEV && import.meta.env.MODE === "development") {
    const override = await import("./dev/model-override.js");
    data = { ...data, ancestors: override.applyModelOverrides(data.ancestors, location.search) };
  }
  const webgpu = await detectWebGpu(navigator);
  let deps = createProductionDependencies(data, webgpu, debugRequested(location.search));
  // The fake model worker exists only in builds made with `--mode test`. The comparison below
  // is folded to `false` in the production build, which drops the import and the fake code.
  if (import.meta.env.MODE === "test") {
    const fake = await import("./fake/bootstrap.js");
    if (fake.fakeModelsRequested(location.search)) {
      deps = fake.createFakeDependencies(location.search, webgpu);
      data = fake.withFakeDownloadSize(data);
      document.documentElement.dataset["modelWorker"] = "fake";
    }
  }
  // REQ-011: production builds on secure contexts only; the note waits for a complete ritual.
  // It starts after the page has loaded, so the 27 MB of precached files do not compete with it.
  const offlineReady = pageLoaded().then(() =>
    registerOfflineShell({
      serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
      production: import.meta.env.PROD,
      secureContext: window.isSecureContext,
      base: import.meta.env.BASE_URL,
      origin: location.origin,
      log: (message, error) => {
        console.warn(message, error);
      },
    }),
  );
  startAltar(document, data, deps, () => {
    void offlineReady.then((ready) => {
      if (ready) showOfflineNote(document);
    });
  });
}

wireAboutPanel(document);
main().catch((error: unknown) => {
  showLoadError(document, error);
});
