import { defineConfig, devices } from "@playwright/test";

/**
 * e2e runs against a test-mode build (`npm run build:e2e`) that includes the fake model worker.
 * Locally a preinstalled Chromium can be used: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome.
 */
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: process.env["CI"] !== undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
    ...devices["Desktop Chrome"],
    launchOptions: {
      ...(executablePath === undefined ? {} : { executablePath }),
      ...(asRoot ? { args: ["--no-sandbox"] } : {}),
    },
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: "npx vite preview --outDir dist-e2e --port 4173 --strictPort",
    url: "http://localhost:4173/OfrendaDeLosModelos/",
    reuseExistingServer: false,
  },
});
