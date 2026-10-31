// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { loadAltarData, type AltarData, type FetchLike } from "../src/data/load.js";
import { renderAltar, showLoadError, wireAboutPanel } from "../src/ui/altar.js";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const fakeFetch: FetchLike = (url) => {
  const file = url.split("/data/")[1] ?? "";
  try {
    const body: unknown = JSON.parse(read(`public/data/${file}`));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  } catch {
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
  }
};

let data: AltarData;

beforeEach(async () => {
  const html = read("index.html");
  const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  // The module script tag is not executed by jsdom; only the static markup is needed.
  document.body.innerHTML = body;
  data = await loadAltarData("/OfrendaDeLosModelos/", fakeFetch);
  renderAltar(document, data);
  wireAboutPanel(document);
});

describe("the altar (AC-001.1)", () => {
  it("shows the levels, candles, water, papel picado and cempasúchil", () => {
    expect(document.querySelectorAll(".level")).toHaveLength(3);
    expect(document.querySelectorAll(".candle").length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector(".glass-of-water")).not.toBeNull();
    expect(document.querySelectorAll(".papel-picado .flag").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".petal").length).toBeGreaterThan(0);
    expect(document.querySelector(".marigold-bed")).not.toBeNull();
  });

  it("shows one place per ancestor, in order, with a portrait frame", () => {
    const places = [...document.querySelectorAll("#places > li")];
    expect(places.map((p) => p.querySelector(".name")?.textContent)).toEqual(
      data.ancestors.map((a) => a.name),
    );
    for (const place of places) expect(place.querySelector(".frame .portrait")).not.toBeNull();
  });

  it("labels live and recorded ancestors", () => {
    expect(document.querySelector('[data-ancestor-id="gpt-2"] .kind')?.textContent).toMatch(/live/);
    expect(document.querySelector('[data-ancestor-id="gemma-2"] .kind')?.textContent).toMatch(
      /recordings/,
    );
  });

  it("shows a dark frame with a linked official source for each retired model", () => {
    const frames = [...document.querySelectorAll("#dark-frames > li")];
    expect(frames).toHaveLength(data.darkFrames.length);
    for (const frame of frames) {
      expect(frame.querySelector("a")?.getAttribute("href")).toMatch(/^https:\/\//);
      expect(frame.textContent).toContain("never released");
    }
    const section = document.getElementById("dark-frames-section")?.textContent ?? "";
    expect(section).toMatch(/Models that cannot return/);
    expect(section).toMatch(/inaccessible digital history/);
    expect(section).toMatch(/software, not for people/);
  });
});

describe("the statement and the about panel (AC-001.2, REQ-009)", () => {
  it("states what the altar is in one line and links the about panel", () => {
    const statement = document.getElementById("statement")?.textContent ?? "";
    expect(statement).toMatch(/artistic tribute to the memory of AI models/);
    expect(statement).toMatch(/Mexican tradition of Día de\s+Muertos/);
    const note = document.getElementById("interpretation-note")?.textContent ?? "";
    expect(note).toMatch(/artistic interpretation, not a Mexican ritual/);
    expect(note).toMatch(/does not speak for the communities/);
    expect(document.getElementById("about-link")?.getAttribute("href")).toBe("#about");
  });

  it("frames the altar as an artistic interpretation and one possible arrangement (NFR-010)", () => {
    const framing = document.getElementById("about-framing")?.textContent ?? "";
    expect(framing).toMatch(/not a Mexican religious, spiritual or family ritual/);
    expect(framing).toMatch(/does not speak\s+for the communities/);
    expect(framing).toMatch(/software, not people/);
    const arrangement = document.getElementById("about-arrangement")?.textContent ?? "";
    expect(arrangement).toMatch(/one possible arrangement/);
    expect(arrangement).toMatch(/vary by region, community and family/);
    expect(arrangement).toMatch(/not\s+the standard/);
  });

  it("opens and closes the about panel from the link", () => {
    const link = document.getElementById("about-link");
    const panel = document.getElementById("about");
    expect(panel?.hidden).toBe(true);
    link?.click();
    expect(panel?.hidden).toBe(false);
    expect(link?.getAttribute("aria-expanded")).toBe("true");
    link?.click();
    expect(panel?.hidden).toBe(true);
    expect(link?.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape and returns focus to the link", () => {
    const link = document.getElementById("about-link");
    const panel = document.getElementById("about");
    link?.click();
    panel?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel?.hidden).toBe(true);
    expect(link?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(link);
  });

  it("returns focus to the link when closed with the link", () => {
    const link = document.getElementById("about-link");
    link?.click();
    link?.click();
    expect(document.activeElement).toBe(link);
  });

  it("lists every model with licence and model card (AC-009.1)", () => {
    const lines = [...document.querySelectorAll("#about-models > li")];
    // Every ancestor, plus the medium (Gemma 4 E2B in its other role).
    expect(lines).toHaveLength(data.ancestors.length + 1);
    const gemma4 = lines.find((l) => l.textContent.includes("Gemma 4 E2B"));
    expect(gemma4?.textContent).toContain("Apache-2.0");
    expect(gemma4?.textContent).toContain("Model card");
    const gemma1 = lines.find((l) => l.textContent.includes("Gemma 1"));
    expect(gemma1?.textContent).toContain("Gemma Terms of Use");
  });

  it("lists the cultural sources (AC-009.2) and the art licence (AC-009.4)", () => {
    const text = document.getElementById("about-sources")?.textContent ?? "";
    for (const publisher of ["UNESCO", "Maxwell Museum", "KUT", "National Geographic", "Detroit"]) {
      expect(text).toContain(publisher);
    }
    expect(document.getElementById("about-assets")?.textContent).toMatch(/original.*MIT/);
  });

  it("states that everything runs on the device and nothing is sent (AC-009.3)", () => {
    const about = document.getElementById("about")?.textContent ?? "";
    expect(about).toMatch(/Everything runs on your device/);
    expect(about).toMatch(/No question or photo is sent anywhere/);
  });
});

describe("text safety", () => {
  it("renders data strings as text, never as HTML", () => {
    const hostile: AltarData = {
      ...data,
      ancestors: [
        {
          ...data.ancestors[0]!,
          name: '<img src=x onerror="alert(1)">',
        },
      ],
    };
    renderAltar(document, hostile);
    expect(document.querySelector("#places img")).toBeNull();
    expect(document.querySelector("#places .name")?.textContent).toBe(
      '<img src=x onerror="alert(1)">',
    );
  });

  it("shows a load error as text in the alert region", () => {
    showLoadError(document, new Error("ancestors.json: .ancestors[0].year must be an integer"));
    const box = document.getElementById("load-error");
    expect(box?.hidden).toBe(false);
    expect(box?.textContent).toContain("must be an integer");
  });
});

describe("loading", () => {
  it("fails with a clear message when a file cannot be loaded", async () => {
    const failing: FetchLike = () =>
      Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
    await expect(loadAltarData("/", failing)).rejects.toThrow("could not be loaded (HTTP 404)");
  });
});
