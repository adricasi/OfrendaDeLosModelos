import { createProductionDependencies, startAltar } from "./app.js";
import { loadAltarData } from "./data/load.js";
import { showLoadError, wireAboutPanel } from "./ui/altar.js";

async function main(): Promise<void> {
  let deps = createProductionDependencies();
  // The fake model worker exists only in builds made with `--mode test`. The comparison below
  // is folded to `false` in the production build, which drops the import and the fake code.
  if (import.meta.env.MODE === "test") {
    const fake = await import("./fake/bootstrap.js");
    if (fake.fakeModelsRequested(location.search)) {
      deps = fake.createFakeDependencies(location.search);
      document.documentElement.dataset["modelWorker"] = "fake";
    }
  }
  const data = await loadAltarData(import.meta.env.BASE_URL);
  startAltar(document, data, deps);
}

wireAboutPanel(document);
main().catch((error: unknown) => {
  showLoadError(document, error);
});
