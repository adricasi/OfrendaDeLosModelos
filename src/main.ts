import { loadAltarData } from "./data/load.js";
import { renderAltar, showLoadError, wireAboutPanel } from "./ui/altar.js";

wireAboutPanel(document);
loadAltarData(import.meta.env.BASE_URL)
  .then((data) => {
    renderAltar(document, data);
  })
  .catch((error: unknown) => {
    showLoadError(document, error);
  });
