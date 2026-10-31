import { createProductionDependencies, pageScripts, startAltar } from "./app.js";
import { loadAltarData } from "./data/load.js";
import { debugRequested } from "./debug/debug-log.js";
import { detectWebGpu } from "./ritual/gpu.js";
import { registerOfflineShell } from "./sw/register.js";
import { showLoadError, showOfflineNote, startAltarMotion, wireAboutPanel } from "./ui/altar.js";

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
  // REQ-011: the service worker (27 MB of files) is registered only after the first complete
  // ritual and only where the live models can run (WebGPU), so a visitor who leaves early or
  // only gets recordings downloads nothing extra. Production builds on secure contexts only.
  let registration: Promise<boolean> | undefined;
  startAltar(document, data, deps, () => {
    if (!deps.webgpu) return;
    registration ??= registerOfflineShell({
      serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
      production: import.meta.env.PROD,
      secureContext: window.isSecureContext,
      base: import.meta.env.BASE_URL,
      known: pageScripts(),
      log: (message, error) => {
        console.warn(message, error);
      },
    });
    void registration.then((ready) => {
      if (ready) showOfflineNote(document);
    });
  });
}

wireAboutPanel(document);
startAltarMotion(document);
main().catch((error: unknown) => {
  showLoadError(document, error);
});
