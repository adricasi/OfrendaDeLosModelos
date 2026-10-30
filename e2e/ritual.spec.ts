import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";

const START = "/OfrendaDeLosModelos/?fake-models";
const OWN_QUESTION = "¿Por qué brilla la luna sobre la ofrenda de mi abuela Remedios?";
const OFFERED_QUESTION = "What do you remember?";

/**
 * NFR-002 helpers. T-004 and T-006 must re-run these tests with the real workers (the fake
 * worker proves the wiring, not the model code): the request list there also contains the model
 * downloads, which must carry no question text either.
 */
interface Traffic {
  readonly requests: Request[];
  readonly websockets: string[];
}

/** Collects every request (and any WebSocket) the page opens. */
function trackRequests(page: Page): Traffic {
  const traffic: Traffic = { requests: [], websockets: [] };
  page.on("request", (request) => traffic.requests.push(request));
  page.on("websocket", (socket) => traffic.websockets.push(socket.url()));
  return traffic;
}

function bodyOf(request: Request): string {
  return request.postDataBuffer()?.toString("utf8") ?? "";
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text.replaceAll("+", " "));
  } catch {
    return text;
  }
}

function expectNoRequestCarries(traffic: Traffic, secret: string): void {
  const needles = [secret, encodeURIComponent(secret), secret.replaceAll(" ", "+")];
  for (const request of traffic.requests) {
    const haystack = `${request.url()} ${bodyOf(request)}`;
    const decoded = safeDecode(haystack);
    for (const needle of needles) {
      expect(haystack, request.url()).not.toContain(needle);
      expect(decoded, request.url()).not.toContain(needle);
    }
  }
  expect(traffic.websockets, "no WebSocket may be opened").toEqual([]);
}

function expectOnlySameOrigin(traffic: Traffic, baseURL: string | undefined): void {
  const origin = new URL(baseURL ?? "http://localhost:4173").origin;
  for (const request of traffic.requests) {
    const url = new URL(request.url());
    // data: and blob: URLs never leave the page.
    if (url.protocol === "data:" || url.protocol === "blob:") continue;
    expect(url.origin, request.url()).toBe(origin);
  }
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

async function waitForAltar(page: Page): Promise<void> {
  await expect(page.locator("#places > li")).toHaveCount(5);
  await expect(page.locator("html")).toHaveAttribute("data-model-worker", "fake");
}

async function tabTo(page: Page, target: Locator, maxTabs = 60): Promise<void> {
  for (let i = 0; i < maxTabs; i += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("could not reach the element with Tab");
}

test("a full ritual for an offered question sends nothing anywhere (AC-002.1, NFR-002)", async ({
  page,
  baseURL,
}) => {
  const traffic = trackRequests(page);
  await page.goto(START);
  await waitForAltar(page);

  await page.getByLabel(OFFERED_QUESTION).check();
  await page.getByRole("button", { name: "Offer it to the altar" }).click();

  await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
  const names = await page.locator(".voice-name").allTextContents();
  expect(names).toEqual([
    "GPT-2",
    "Gemma 1",
    "Gemma 2",
    "Gemma 3",
    "Gemma 4 E2B",
    "La que cuida el altar",
  ]);
  await expect(page.locator(".voice").nth(0).locator(".voice-text")).toContainText(
    "[gpt-2]Fake voice",
  );
  await expect(page.locator(".voice").nth(1).locator(".voice-text")).toContainText(
    "Fake recording of gemma-1",
  );
  await expect(page.locator(".voice").nth(1).locator(".voice-label")).toHaveText("Recorded voice");

  expect(traffic.requests.length).toBeGreaterThan(0);
  expectOnlySameOrigin(traffic, baseURL);
  expectNoRequestCarries(traffic, OFFERED_QUESTION);

  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.cookie)).toBe("");
  await expectNoSeriousViolations(page);
});

test("a full ritual for an own question: recorded ancestors rest (AC-002.2, AC-005.3, NFR-002)", async ({
  page,
  baseURL,
}) => {
  const traffic = trackRequests(page);
  await page.goto(START);
  await waitForAltar(page);

  await page.getByRole("textbox", { name: "Your own question" }).fill(`  ${OWN_QUESTION}  `);
  await page.getByRole("button", { name: "Offer it to the altar" }).click();

  await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
  await expect(page.locator("#ritual-question")).toHaveText(OWN_QUESTION);
  const resting = page.locator('.voice[data-state="not-invited"]');
  await expect(resting).toHaveCount(3);
  await expect(resting.first().locator(".voice-status")).toContainText(
    "only answer the questions they left for us",
  );
  await expect(page.locator('.voice[data-state="spoken"]')).toHaveCount(3);

  expectOnlySameOrigin(traffic, baseURL);
  expectNoRequestCarries(traffic, OWN_QUESTION);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await expectNoSeriousViolations(page);
});

test("validation errors appear next to the field and keep the input (AC-002.3)", async ({
  page,
}) => {
  await page.goto(START);
  await waitForAltar(page);

  await page.getByLabel("Write your own question").check();
  await page.getByRole("button", { name: "Offer it to the altar" }).click();
  await expect(page.locator("#own-error")).toContainText("Write a question first");
  await expect(page.getByRole("textbox", { name: "Your own question" })).toBeFocused();
  await expect(page.locator("#ritual")).toBeHidden();
  await expectNoSeriousViolations(page);

  await page.getByRole("textbox", { name: "Your own question" }).fill("x".repeat(281));
  await page.getByRole("button", { name: "Offer it to the altar" }).click();
  await expect(page.locator("#own-error")).toContainText("too long");
  await expect(page.getByRole("textbox", { name: "Your own question" })).toHaveValue(
    "x".repeat(281),
  );
  await expectNoSeriousViolations(page);
});

test("the Stop control cancels the ritual and nothing else can be offered meanwhile (AC-002.4)", async ({
  page,
}) => {
  await page.goto(`${START}&fake-delay=150`);
  await waitForAltar(page);

  await page.getByLabel(OFFERED_QUESTION).check();
  await page.getByRole("button", { name: "Offer it to the altar" }).click();

  const stop = page.getByRole("button", { name: "Stop the ritual" });
  await expect(stop).toBeFocused();
  await expect(page.getByRole("button", { name: "Offer it to the altar" })).toBeDisabled();
  await expect(page.getByLabel(OFFERED_QUESTION)).toBeDisabled();
  await expect(page.locator(".place.speaking")).toHaveCount(1);

  await stop.click();
  await expect(page.locator("#ritual-end")).toHaveText("The ritual was stopped.");
  await expect(page.locator(".place.speaking")).toHaveCount(0);
  expect(await page.locator(".voice").count()).toBeLessThan(6);
  await expect(page.getByRole("button", { name: "Offer it to the altar" })).toBeEnabled();
});

test("a failing ancestor does not stop the ritual (AC-003.3)", async ({ page }) => {
  await page.goto(`${START}&fake-fail=gpt-2`);
  await waitForAltar(page);
  await page.getByLabel(OFFERED_QUESTION).check();
  await page.getByRole("button", { name: "Offer it to the altar" }).click();
  await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
  await expect(page.locator(".voice").first().locator(".voice-status")).toHaveText(
    "This ancestor could not come tonight.",
  );
  await expect(page.locator('.voice[data-state="spoken"]')).toHaveCount(2);
});

test("the whole flow works with the keyboard alone (NFR-009)", async ({ page }) => {
  await page.goto(`${START}&fake-delay=60`);
  await waitForAltar(page);

  // Tab enters the radio group at its first option; Space chooses it.
  await tabTo(page, page.getByLabel("What happens when we die?"));
  await page.keyboard.press("Space");
  await expect(page.getByLabel("What happens when we die?")).toBeChecked();

  await tabTo(page, page.getByRole("button", { name: "Offer it to the altar" }));
  await page.keyboard.press("Enter");

  // Focus moves to Stop; Enter on it stops the ritual.
  await expect(page.getByRole("button", { name: "Stop the ritual" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#ritual-end")).toHaveText("The ritual was stopped.");
  await expect(page.getByRole("button", { name: "Offer it to the altar" })).toBeFocused();

  // And a second ritual, to the end, from the keyboard.
  await page.keyboard.press("Enter");
  await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.", {
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Offer it to the altar" })).toBeFocused();
  await expectNoSeriousViolations(page);
});

test("announces each answer once, when complete (NFR-009)", async ({ page }) => {
  await page.goto(START);
  await waitForAltar(page);
  await page.getByLabel(OFFERED_QUESTION).check();
  await page.getByRole("button", { name: "Offer it to the altar" }).click();
  await expect(page.locator("#ritual-end")).toHaveText("The ritual is complete.");
  const announcements = await page.locator("#ritual-announcer p").allTextContents();
  expect(announcements.filter((a) => a.startsWith("GPT-2:"))).toHaveLength(1);
  expect(announcements).toHaveLength(8);
});

test("the page without ?fake-models in a test build uses no fake worker", async ({ page }) => {
  await page.goto("/OfrendaDeLosModelos/");
  await expect(page.locator("#places > li")).toHaveCount(5);
  await expect(page.locator("html")).not.toHaveAttribute("data-model-worker", "fake");
});

test("negative control: the privacy assertion catches a leaking fetch and beacon (NFR-002)", async ({
  page,
}) => {
  const traffic = trackRequests(page);
  await page.goto(START);
  await waitForAltar(page);
  expectNoRequestCarries(traffic, OWN_QUESTION);

  const beacon = page.waitForRequest((r) => r.method() === "POST");
  await page.evaluate((question) => {
    void fetch(`/OfrendaDeLosModelos/?q=${encodeURIComponent(question)}`).catch(() => undefined);
    navigator.sendBeacon("/OfrendaDeLosModelos/beacon", question);
  }, OWN_QUESTION);
  await beacon;
  await expect
    .poll(() => traffic.requests.filter((r) => r.url().includes("?q=")).length)
    .toBeGreaterThan(0);

  expect(() => expectNoRequestCarries(traffic, OWN_QUESTION)).toThrow();
  // Each channel is detected on its own.
  const urlOnly: Traffic = {
    requests: traffic.requests.filter((r) => r.url().includes("?q=")),
    websockets: [],
  };
  const bodyOnly: Traffic = {
    requests: traffic.requests.filter((r) => r.method() === "POST"),
    websockets: [],
  };
  expect(() => expectNoRequestCarries(urlOnly, OWN_QUESTION)).toThrow();
  expect(() => expectNoRequestCarries(bodyOnly, OWN_QUESTION)).toThrow();
  expect(() => expectNoRequestCarries({ requests: [], websockets: ["ws://x"] }, "q")).toThrow();
});
