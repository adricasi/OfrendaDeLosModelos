import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const BASE = "/OfrendaDeLosModelos/?fake-models";
const OFFERED_QUESTION = "What do you remember?";
const OWN_QUESTION = "¿Por qué brilla la luna sobre la ofrenda?";

async function waitForAltar(page: Page): Promise<void> {
  await expect(page.locator("#places > li")).toHaveCount(5);
  await expect(page.locator("html")).toHaveAttribute("data-model-worker", "fake");
}

async function offerOffered(page: Page): Promise<void> {
  await page.getByLabel(OFFERED_QUESTION).check();
  await page.getByRole("button", { name: "Offer it to the altar" }).click();
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => v.id)).toEqual([]);
}

test.describe("the medium (REQ-007)", () => {
  test("writes a meaning and a four-line calaverita for each ancestor (AC-007.1)", async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForAltar(page);
    await offerOffered(page);
    await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
    const notes = page.locator('.voice[data-step-id="medium"] .medium-note');
    await expect(notes).toHaveCount(5);
    await expect(notes.first().locator("h4")).toHaveText("GPT-2");
    await expect(notes.first().locator(".medium-calaverita")).toHaveText(
      "Line one for the altar,\nline two will not falter,\nline three sets us free,\nline four, rest in peace.",
    );
    await expect(page.locator('.voice[data-step-id="medium"] .voice-label')).toHaveText(
      "Speaking live, on your device",
    );
    await expectNoSeriousViolations(page);
  });

  test("answers in Spanish for a Spanish question and honours only the ancestors who spoke (AC-007.2)", async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForAltar(page);
    await page.getByRole("textbox", { name: "Your own question" }).fill(OWN_QUESTION);
    await page.getByRole("button", { name: "Offer it to the altar" }).click();
    await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
    const notes = page.locator('.voice[data-step-id="medium"] .medium-note');
    await expect(notes).toHaveCount(2);
    await expect(notes.first().locator(".medium-calaverita")).toContainText("Linea uno del altar");
  });

  test("a broken first reply is retried once and then shown as notes", async ({ page }) => {
    await page.goto(`${BASE}&fake-medium=broken-then-valid`);
    await waitForAltar(page);
    await offerOffered(page);
    await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
    await expect(page.locator('.voice[data-step-id="medium"] .medium-note')).toHaveCount(5);
  });

  test("shows the text it produced as one message when it cannot be parsed (AC-007.4)", async ({
    page,
  }) => {
    await page.goto(`${BASE}&fake-medium=broken`);
    await waitForAltar(page);
    await offerOffered(page);
    await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
    const medium = page.locator('.voice[data-step-id="medium"]');
    await expect(medium.locator(".medium-note")).toHaveCount(0);
    await expect(medium.locator(".voice-text")).toContainText("not as JSON");
    await expectNoSeriousViolations(page);
  });
});

test.describe("Gemma 4 asks before it downloads (REQ-006)", () => {
  const UNCACHED = `${BASE}&fake-uncached`;

  test("agreeing downloads it, streams its answer and lets the medium write (AC-006.1, AC-006.2)", async ({
    page,
  }) => {
    await page.goto(UNCACHED);
    await waitForAltar(page);
    await offerOffered(page);
    const consent = page.locator(".consent");
    await expect(consent).toBeVisible();
    await expect(consent).toContainText("Gemma 4 E2B is not stored on this device yet");
    await expect(consent).toBeFocused();
    await expect(consent).toContainText("download of about 1.9 GB");
    await expectNoSeriousViolations(page);
    await page.getByRole("button", { name: "Download and continue" }).click();
    await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
    await expect(page.locator('.voice[data-step-id="gemma-4-e2b"] .voice-text')).toContainText(
      "[gemma-4-e2b]",
    );
    await expect(page.locator('.voice[data-step-id="medium"] .medium-note')).toHaveCount(5);
    await expect(consent).toHaveCount(0);
  });

  test("declining shows the recorded Gemma 4 and the recorded medium, labelled (AC-006.3, AC-007.5)", async ({
    page,
  }) => {
    await page.goto(UNCACHED);
    await waitForAltar(page);
    await offerOffered(page);
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
    const gemma = page.locator('.voice[data-step-id="gemma-4-e2b"]');
    await expect(gemma.locator(".voice-label")).toHaveText("Recorded voice");
    await expect(gemma.locator(".voice-text")).toContainText("Fake recording of gemma-4-e2b");
    const medium = page.locator('.voice[data-step-id="medium"]');
    await expect(medium.locator(".voice-label")).toHaveText("Recorded voice");
    await expect(medium.locator(".voice-text")).toContainText("Fake recording of the medium");
  });

  test("declining for an own question says Gemma 4 is waiting to be invited (AC-006.3)", async ({
    page,
  }) => {
    await page.goto(UNCACHED);
    await waitForAltar(page);
    await page.getByRole("textbox", { name: "Your own question" }).fill(OWN_QUESTION);
    await page.getByRole("button", { name: "Offer it to the altar" }).click();
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
    await expect(page.locator('.voice[data-step-id="gemma-4-e2b"] .voice-status')).toContainText(
      "waiting to be invited",
    );
  });

  test("stopping while it asks removes the question", async ({ page }) => {
    await page.goto(UNCACHED);
    await waitForAltar(page);
    await offerOffered(page);
    await expect(page.locator(".consent")).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.locator("#ritual-end")).toHaveText("The ritual was stopped.");
    await expect(page.locator(".consent")).toHaveCount(0);
  });

  test("Gemma 4 failing ends the ritual without the medium (AC-006.4)", async ({ page }) => {
    await page.goto(`${BASE}&fake-fail=gemma-4-e2b`);
    await waitForAltar(page);
    await offerOffered(page);
    await expect(page.locator("#ritual-end")).toContainText("ended early");
    await expect(page.locator('.voice[data-step-id="medium"]')).toHaveCount(0);
  });
});
