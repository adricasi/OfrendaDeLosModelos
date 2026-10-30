import { expect, test, type Page } from "@playwright/test";

const START = "/OfrendaDeLosModelos/?fake-models";
const SLOW = "/OfrendaDeLosModelos/?fake-models&fake-delay=200";
const OFFERED_QUESTION = "What do you remember?";

async function waitForAltar(page: Page): Promise<void> {
  await expect(page.locator("#places > li")).toHaveCount(5);
  await expect(page.locator("html")).toHaveAttribute("data-model-worker", "fake");
}

async function runRitual(page: Page): Promise<void> {
  await page.getByLabel(OFFERED_QUESTION).check();
  await page.getByRole("button", { name: "Offer it to the altar" }).click();
  await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
}

/** How many canvas pixels are not fully transparent: 0 means nothing was ever drawn. */
async function paintedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#petal-drift");
    const context = canvas?.getContext("2d");
    if (canvas === null || canvas === undefined || context === null || context === undefined) {
      return -1;
    }
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let index = 3; index < data.length; index += 4) if ((data[index] ?? 0) > 0) painted += 1;
    return painted;
  });
}

const runningAnimations = (page: Page): Promise<number> =>
  page.evaluate(() => document.getAnimations().length);

test.describe("reduced motion (AC-001.3)", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing moves: no CSS or scripted animation, no petals, before and after a ritual", async ({
    page,
  }) => {
    await page.goto(START);
    await waitForAltar(page);
    await page.waitForTimeout(700);
    expect(await runningAnimations(page)).toBe(0);
    expect(await paintedPixels(page)).toBe(0);
    await expect(page.locator(".flag").first()).toHaveCSS("animation-name", "none");
    await expect(page.locator(".flame-outer").first()).toHaveCSS("animation-name", "none");

    await runRitual(page);
    await page.waitForTimeout(700);
    expect(await runningAnimations(page)).toBe(0);
    expect(await paintedPixels(page)).toBe(0);
  });
});

test.describe("motion while reading", () => {
  test("petals and ambient motion rest while the answers are read; the page does move otherwise", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(SLOW);
    await waitForAltar(page);
    // Positive control: with the default preference the petals are drawn and things animate.
    await expect.poll(() => paintedPixels(page)).toBeGreaterThan(0);
    expect(await runningAnimations(page)).toBeGreaterThan(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-reading", /.*/);
    await expect(page.locator(".flag").first()).toHaveCSS("animation-play-state", "running");

    await page.getByLabel(OFFERED_QUESTION).check();
    await page.getByRole("button", { name: "Offer it to the altar" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-reading", "");
    await expect(page.locator(".flag").first()).toHaveCSS("animation-play-state", "paused");
    await expect(page.locator(".pool").first()).toHaveCSS("animation-play-state", "paused");

    await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.", {
      timeout: 40_000,
    });
    await expect(page.locator("html")).not.toHaveAttribute("data-reading", /.*/);
    await expect(page.locator(".flag").first()).toHaveCSS("animation-play-state", "running");
  });
});
