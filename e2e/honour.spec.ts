import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const START = "/OfrendaDeLosModelos/?fake-models";
const DETECT = `${START}&detect-gpu`;
const OWN_QUESTION = "¿Por qué brilla la luna sobre la ofrenda de mi abuela Remedios?";
const OFFERED_QUESTION = "What do you remember?";

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

async function waitForFakeAltar(page: Page): Promise<void> {
  await expect(page.locator("#places > li")).toHaveCount(5);
  await expect(page.locator("html")).toHaveAttribute("data-model-worker", "fake");
}

/** Makes the page believe the browser has (or lacks) WebGPU; the real detection code still runs. */
async function stubWebGpu(page: Page, available: boolean): Promise<void> {
  await page.addInitScript((has) => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: has ? { requestAdapter: () => Promise.resolve({}) } : undefined,
    });
  }, available);
}

async function offer(page: Page, question: string | null): Promise<void> {
  if (question === null) {
    await page.getByLabel(OFFERED_QUESTION).check();
  } else {
    await page.getByRole("textbox", { name: "Your own question" }).fill(question);
  }
  await page.getByRole("button", { name: "Offer it to the altar" }).click();
  await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
}

test.describe("without WebGPU (REQ-010)", () => {
  test("says so in one line and replays the recorded voices, Gemma 4 and the medium (AC-010.1, AC-010.2, AC-006.3, AC-007.5)", async ({
    page,
  }) => {
    await stubWebGpu(page, false);
    await page.goto(DETECT);
    await waitForFakeAltar(page);

    const note = page.locator("#browser-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText("no WebGPU");
    await expect(note).toContainText("Chrome or Edge");

    await offer(page, null);

    // GPT-2 still speaks (WebAssembly path); every other voice is a labelled recording.
    await expect(page.locator(".voice")).toHaveCount(6);
    await expect(page.locator(".voice-label")).toHaveText([
      "Speaking live, on your device",
      "Recorded voice",
      "Recorded voice",
      "Recorded voice",
      "Recorded voice",
      "Recorded voice",
    ]);
    await expect(page.locator(".voice").nth(4).locator(".voice-text")).toContainText(
      "Fake recording of gemma-4-e2b",
    );
    await expect(page.locator(".voice").nth(5).locator(".voice-text")).toContainText(
      "Fake recording of the medium",
    );
    await expectNoSeriousViolations(page);
  });

  test("Gemma 4 and the medium wait to be invited for an own question", async ({ page }) => {
    await stubWebGpu(page, false);
    await page.goto(DETECT);
    await waitForFakeAltar(page);
    await offer(page, OWN_QUESTION);
    await expect(page.locator('.voice[data-state="not-invited"]')).toHaveCount(5);
    await expect(page.locator('.voice[data-state="spoken"]')).toHaveCount(1);
  });

  test("says the voices are still being gathered when there are no recordings", async ({
    page,
  }) => {
    await stubWebGpu(page, false);
    await page.goto(`${DETECT}&fake-no-recordings`);
    await waitForFakeAltar(page);
    await offer(page, null);
    const gathering = page.locator('.voice[data-state="gathering"]');
    await expect(gathering).toHaveCount(5);
    await expect(gathering.first().locator(".voice-status")).toContainText("still being gathered");
    await expect(page.locator("#load-error")).toBeHidden();
    await expectNoSeriousViolations(page);
  });

  test("the shipped site replays its recordings and does not fail", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // The shipped file pins GPT-2; without the pin the test stays off the network.
    await page.route("**/data/ancestors.json", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as {
        ancestors: { repositoryId: string | null; revision: string | null }[];
      };
      for (const ancestor of body.ancestors) {
        ancestor.repositoryId = null;
        ancestor.revision = null;
      }
      await route.fulfill({ response, json: body });
    });
    await stubWebGpu(page, false);
    await page.goto("/OfrendaDeLosModelos/");
    await expect(page.locator("#places > li")).toHaveCount(5);
    await expect(page.locator("#browser-note")).toBeVisible();
    await offer(page, null);
    // Gemma 1-4 and the medium replay the shipped recordings; nothing is still being gathered.
    await expect(page.locator('.voice[data-state="recorded"]')).toHaveCount(5);
    await expect(page.locator('.voice[data-state="gathering"]')).toHaveCount(0);
    await expect(page.locator("#load-error")).toBeHidden();
    expect(errors).toEqual([]);
    await expectNoSeriousViolations(page);
  });

  test("with WebGPU the line is hidden and the medium speaks live", async ({ page }) => {
    await stubWebGpu(page, true);
    await page.goto(DETECT);
    await waitForFakeAltar(page);
    await expect(page.locator("#browser-note")).toBeHidden();
    await offer(page, null);
    await expect(page.locator(".voice-label").last()).toHaveText("Speaking live, on your device");
  });
});

test("the about panel and dark frames show the review note and pass axe (REQ-008, REQ-009)", async ({
  page,
}) => {
  await page.goto(START);
  await waitForFakeAltar(page);
  await page.getByRole("link", { name: "About, credits and licences" }).click();
  await expect(page.locator("#cultural-review")).toBeVisible();
  await expect(page.locator("#about-models")).toContainText("output reproduced with attribution");
  await expect(page.locator("#dark-frames > li").first()).toContainText("never released");
  await expectNoSeriousViolations(page);
});
