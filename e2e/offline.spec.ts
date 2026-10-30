import { expect, test, type Page } from "@playwright/test";

const START = "/OfrendaDeLosModelos/?fake-models";
const OFFERED_QUESTION = "What do you remember?";
const OFFLINE_NOTE = "This altar now works offline on this device.";

async function completeRitual(page: Page): Promise<void> {
  await expect(page.locator("#places > li")).toHaveCount(5);
  await expect(page.locator("html")).toHaveAttribute("data-model-worker", "fake");
  await page.getByLabel(OFFERED_QUESTION).check();
  await page.getByRole("button", { name: "Offer it to the altar" }).click();
  await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
  await expect(page.locator(".voice-name")).toHaveCount(6);
}

test("the altar opens and a full ritual runs with the network off (AC-011.1, REQ-011)", async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://localhost:4173").origin;
  await page.goto(START);
  await expect(page.locator("#offline-note")).toHaveText("");
  // Nothing is registered (and so nothing is downloaded) before the first complete ritual.
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
  await completeRitual(page);

  // After one complete ritual the page says so, once the service worker holds the shell.
  await expect(page.locator("#offline-note")).toHaveText(OFFLINE_NOTE);

  // What the worker stored: only this site's own files, never a query string, and the cache
  // of transformers.js is not its business (NFR-002).
  const stored = await page.evaluate(async () => {
    const result: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      result[name] = (await (await caches.open(name)).keys()).map((request) => request.url);
    }
    return result;
  });
  const names = Object.keys(stored);
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^ofrenda-shell-[0-9a-f]{16}$/);
  const urls = Object.values(stored).flat();
  expect(urls.length).toBeGreaterThan(5);
  for (const url of urls) {
    expect(new URL(url).origin, url).toBe(origin);
    expect(new URL(url).search, url).toBe("");
  }
  expect(urls.some((url) => url.endsWith("/index.html"))).toBe(true);
  expect(urls.some((url) => url.endsWith("/data/recorded-voices.json"))).toBe(true);
  expect(urls.some((url) => url.endsWith(".wasm"))).toBe(true);

  // A cross-origin request is never answered by the service worker (model downloads are
  // transformers.js's own business). The page's own routing serves a stand-in for it here.
  await page.route("https://huggingface.co/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "from the network" }),
  );
  const responded = page.waitForResponse("https://huggingface.co/**");
  await page.evaluate(() => fetch("https://huggingface.co/some/model/resolve/main/x.onnx"));
  expect((await responded).fromServiceWorker()).toBe(false);
  await page.unroute("https://huggingface.co/**");

  // The network goes away; the altar still opens and a whole ritual still runs.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#offline-note")).toHaveText("");
  await completeRitual(page);
  // The page itself came from the worker's cache.
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
});

test("a visitor who has not finished a ritual gets no service worker and no note", async ({
  page,
}) => {
  await page.goto(START);
  await expect(page.locator("#places > li")).toHaveCount(5);
  await page.waitForTimeout(500);
  await expect(page.locator("#offline-note")).toHaveText("");
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
});

test("a stopped ritual does not start the service worker", async ({ page }) => {
  await page.goto(START);
  await expect(page.locator("#places > li")).toHaveCount(5);
  await page.getByLabel(OFFERED_QUESTION).check();
  await page.getByRole("button", { name: "Offer it to the altar" }).click();
  await page.getByRole("button", { name: "Stop the ritual" }).click();
  await expect(page.locator("#ritual-end")).toHaveText("The ritual was stopped.");
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
});
