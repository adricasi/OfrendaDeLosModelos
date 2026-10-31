// Renders the diagram pages in this folder to ../*.png (device scale factor 2).
// Run from anywhere: node docs/images/src/render.mjs
// Needs @playwright/test (a dev dependency) and a Chromium: set PLAYWRIGHT_CHROMIUM_EXECUTABLE
// to its path, or let Playwright use the browser it installed.
import { chromium } from "@playwright/test";
import console from "node:console";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pages = [
  ["architecture.html", "diagram-architecture.png"],
  ["ritual-flow.html", "diagram-ritual-flow.png"],
  ["gemma-roles.html", "diagram-gemma-roles.png"],
  ["ghost-words.html", "diagram-ghost-words.png"],
];

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({
  ...(executablePath === undefined ? {} : { executablePath }),
  args: process.getuid?.() === 0 ? ["--no-sandbox"] : [],
});
try {
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  for (const [source, target] of pages) {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(here, source)).href);
    await page.evaluate("document.fonts.ready");
    const canvas = page.locator("#canvas");
    await canvas.screenshot({ path: join(here, "..", target) });
    console.log(`rendered ${target}`);
    await page.close();
  }
} finally {
  await browser.close();
}
