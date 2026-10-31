// Raw footage for the intro video (step 1 of 2; tools/intro-edit.mjs is step 2).
// Real interaction with the REAL production site in headless Chromium (no GPU: GPT-2 runs live on
// WebAssembly, the Gemma voices and the medium replay their recordings, labelled as such).
// Nothing is faked, stubbed or edited.
//   npm run build && npx vite preview --outDir dist --port 4196 --strictPort
//   node tools/intro-capture.mjs http://localhost:4196/OfrendaDeLosModelos/ <out-dir>
// One unrecorded ritual first (profile kept in <out-dir>/browser-profile, so GPT-2 is cached), then
// one long take of many short beats, piped straight into ffmpeg at a constant 30 fps (no frames
// on disk). Writes to <out-dir>/intro-raw/: raw.mp4 (1920x1080), markers.json (seconds into
// raw.mp4 for every beat, element rectangles in video pixels, and the texts GPT-2 and the page
// wrote). The last beat clicks "Forget the models", so the next run downloads GPT-2 again (~281 MB).
// A soft cursor drawn in the page's overlay layer glides to what is about to be clicked.
// Set CHROMIUM_PATH to override /opt/pw-browsers/chromium. Needs ffmpeg on PATH. Not part of the
// site or CI.
/* global document, window, HTMLElement, performance, requestAnimationFrame, scrollTo, scrollY, innerHeight -- browser code inside page.evaluate */
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import process from "node:process";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const [BASE, OUT] = process.argv.slice(2);
if (BASE === undefined || OUT === undefined) {
  console.error("usage: node tools/intro-capture.mjs <site-url> <out-dir>");
  process.exit(1);
}
const RAW = `${OUT}/intro-raw`;
const MODEL_TIMEOUT = 30 * 60_000;
const VIEWPORT = { width: 1280, height: 720 };
const SCALE = 1.5; // 1280x720 CSS pixels -> 1920x1080 frames
const FPS = 30;
const QUESTION = { en: "What do you remember?", es: "¿Qué recuerdas?" };

const ctx = await chromium.launchPersistentContext(`${OUT}/browser-profile`, {
  viewport: VIEWPORT,
  reducedMotion: "no-preference",
  bypassCSP: true, // only lets the overlay layer add its stylesheet; the site is unchanged
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: [`--force-device-scale-factor=${SCALE}`], // frames at 1920x1080, layout at 1280x720
  headless: true,
});
// The page moves focus when a ritual ends, which makes the browser scroll. The camera stays where
// the take puts it, so focusing never scrolls in this recording.
await ctx.addInitScript(() => {
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (options) {
    return focus.call(this, { ...options, preventScroll: true });
  };
});
const p = ctx.pages()[0] ?? (await ctx.newPage());

// The overlay layer holds only the cursor.
async function installLayer() {
  await p.evaluate(() => {
    const css = document.createElement("style");
    css.textContent = `
      #demo-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483647}
      #demo-cursor{position:absolute;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;
        background:radial-gradient(circle,rgb(255 244 224 / .9) 0 3px,rgb(255 244 224 / .22) 4px);
        border:2px solid rgb(255 244 224 / .8);box-shadow:0 0 16px rgb(255 190 110 / .55);
        opacity:0;transition:opacity .4s,transform .16s}
      #demo-cursor[data-press]{transform:scale(.72)}`;
    document.head.append(css);
    const layer = document.createElement("div");
    layer.id = "demo-layer";
    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    layer.append(cursor);
    document.body.append(layer);
    // Blank room below the page, so the camera can frame a card that is still growing.
    const spacer = document.createElement("div");
    spacer.style.height = "900px";
    document.body.append(spacer);
  });
}

// Eased scroll so the camera moves like a hand; never aims past the end of the page.
const glide = (target, ms, gap = 40) =>
  p.evaluate(
    ([sel, dur, margin]) =>
      new Promise((done) => {
        const y0 = scrollY;
        const el = typeof sel === "string" ? document.querySelector(sel) : null;
        const max = document.documentElement.scrollHeight - innerHeight;
        const y1 = Math.max(
          0,
          Math.min(max, el ? y0 + el.getBoundingClientRect().top - margin : sel),
        );
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur);
          scrollTo(0, y0 + (y1 - y0) * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2));
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    [target, ms, gap],
  );
// Instant move of the camera (the editor never shows the frames around it).
const jump = (selector, gap = 40) =>
  p.evaluate(
    ([sel, margin]) =>
      scrollTo(0, scrollY + document.querySelector(sel).getBoundingClientRect().top - margin),
    [selector, gap],
  );
const wait = (ms) => p.waitForTimeout(ms);

let cursorAt = { x: 1010, y: 610 };
const cursorTo = async (x, y, ms) => {
  await p.evaluate(
    ([from, to, dur]) =>
      new Promise((done) => {
        const el = document.getElementById("demo-cursor");
        el.style.opacity = "1";
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur);
          const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          el.style.left = `${from.x + (to.x - from.x) * e}px`;
          el.style.top = `${from.y + (to.y - from.y) * e}px`;
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    [cursorAt, { x, y }, ms],
  );
  cursorAt = { x, y };
};
const centre = async (locator) => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Cannot aim the cursor at an element that is not on screen");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const press = async ({ x, y }) => {
  await p.evaluate(() => document.getElementById("demo-cursor").setAttribute("data-press", ""));
  await p.mouse.click(x, y, { delay: 120 });
  await p.evaluate(() => document.getElementById("demo-cursor").removeAttribute("data-press"));
};
const hideCursor = () =>
  p.evaluate(() => (document.getElementById("demo-cursor").style.opacity = "0"));
// Cursor to a locator, then a real click on it.
const clickWithCursor = async (locator, glideMs = 1300, offsetX = 0) => {
  const at = await centre(locator);
  await cursorTo(at.x + offsetX, at.y, glideMs);
  await wait(300);
  await press(at);
};

// Beat markers (seconds into raw.mp4) and element rectangles (video pixels, at the moment asked).
const markAt = {};
const mark = (name) => {
  markAt[name] = Date.now() / 1000;
};
const rects = {};
const rectsOf = async (name, selector, max = 12) => {
  rects[name] = await p.evaluate(
    ([sel, limit, scale]) =>
      [...document.querySelectorAll(sel)]
        .slice(0, limit)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.bottom > 0 && r.top < innerHeight)
        .map((r) => ({
          x: Math.round(r.x * scale),
          y: Math.round(r.y * scale),
          w: Math.round(r.width * scale),
          h: Math.round(r.height * scale),
        })),
    [selector, max, SCALE],
  );
};

// Screencast frames go straight into ffmpeg at a constant 30 fps: a frame is repeated until the
// next one arrives. Writes are queued so frames stay in order.
mkdirSync(RAW, { recursive: true });
const encoder = spawn(
  "ffmpeg",
  [
    ...["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS)],
    ...["-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "fast", "-crf", "15"],
    ...["-pix_fmt", "yuv420p", `${RAW}/raw.mp4`],
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
const encoderClosed = new Promise((resolve) => encoder.on("close", resolve));
let queue = Promise.resolve();
const feed = (buffer, copies) => {
  queue = queue.then(async () => {
    for (let i = 0; i < copies; i++) {
      if (!encoder.stdin.write(buffer)) await new Promise((r) => encoder.stdin.once("drain", r));
    }
  });
  return queue;
};
let firstTimestamp = null;
let lastFrame = null;
let lastIndex = 0;
let frameCount = 0;
const cdp = await ctx.newCDPSession(p);
cdp.on("Page.screencastFrame", async (f) => {
  const timestamp = f.metadata.timestamp;
  firstTimestamp ??= timestamp;
  const index = Math.round((timestamp - firstTimestamp) * FPS);
  if (lastFrame !== null && index > lastIndex) {
    void feed(lastFrame, index - lastIndex);
    lastIndex = index;
  }
  if (lastFrame === null || index >= lastIndex) lastFrame = Buffer.from(f.data, "base64");
  frameCount += 1;
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});

// Warm-up (not recorded): one full ritual online, so GPT-2 is cached and loads fast in the take.
console.log("Warm-up: one ritual online to cache GPT-2 (the first run downloads ~281 MB).");
await p.goto(BASE);
await p.waitForSelector("#places > li");
await p.getByLabel(QUESTION.en).check();
await p.getByRole("button", { name: "Offer it to the altar" }).click();
await p.waitForSelector("#ritual-end:not(:empty)", { timeout: MODEL_TIMEOUT });
await p.goto(BASE);
await p.waitForSelector("#places > li");
await installLayer();
await p.evaluate(() => scrollTo(0, 0));
await cdp.send("Page.startScreencast", {
  format: "jpeg",
  quality: 82,
  maxWidth: VIEWPORT.width * SCALE,
  maxHeight: VIEWPORT.height * SCALE,
});
await wait(1200);

// 1. The dark frames (closed models whose weights were never released).
mark("dark_glide_start");
await glide("#dark-frames-section", 2600, -50);
mark("dark_glide_end");
await rectsOf("dark_frames", "#dark-frames > li");
await wait(5500);
mark("dark_hold_end");
// It sits below the ritual in the page; out of the way for the shots that follow.
await p.evaluate(() => (document.getElementById("dark-frames-section").hidden = true));

// 2. The altar: one glide from the top over the papel picado to the places, then holds on it.
await glide(0, 10);
await wait(900);
mark("altar_glide_start");
await glide("#places", 9000);
mark("altar_glide_end");
await rectsOf("places", "#places > li");
await rectsOf("top_candles", "#top-candles .candle");
await rectsOf("place_candles", ".place-candle");
await wait(6500);
mark("places_hold_end");

// 3. The language switch: the offered questions in Spanish and back.
await glide("#offering", 2400);
await wait(900);
mark("language_start");
await clickWithCursor(p.locator('label:has(input[name="language"][value="es"])'), 1300);
mark("language_es");
await rectsOf("offered_es", "#offered-questions .choice", 6);
await wait(2600);
await clickWithCursor(p.locator('label:has(input[name="language"][value="en"])'), 1000);
mark("language_en");
await wait(1700);

// 4. The offering: the cursor chooses the question, then the button.
const radio = await centre(p.locator("label.choice", { hasText: QUESTION.en }));
mark("question_cursor_start");
await cursorTo(radio.x - 40, radio.y, 1500);
await wait(300);
await press(radio);
mark("question_click");
await wait(1200);
const offerButton = p.getByRole("button", { name: "Offer it to the altar" });
const buttonY = (await centre(offerButton)).y;
if (buttonY > 540) {
  const y0 = await p.evaluate(() => scrollY);
  await glide(y0 + buttonY - 540, 1200);
  await wait(400);
}
const button = await centre(offerButton);
mark("offer_cursor_start");
await cursorTo(button.x, button.y, 1300);
await wait(400);
await press(button);
mark("offer_click");
await hideCursor();

// 5. GPT-2's place lights while it speaks: the camera is already at the altar.
await p.waitForSelector("#ritual:not([hidden])");
await jump("#places");
await rectsOf("places_speaking", "#places > li");
mark("place_speaking_start");
await wait(4200);
mark("place_speaking_end");

// 6. GPT-2 on WebAssembly: frame its card while it loads, film from the first word.
await jump("#ritual-voices", 90);
await p.waitForSelector(".token", { timeout: MODEL_TIMEOUT });
mark("gpt2_first_token");
await p.waitForFunction(() => document.querySelectorAll(".token").length >= 12, null, {
  timeout: MODEL_TIMEOUT,
});
await wait(1500);
// A row of plain words to sweep across: hovering each shows its ghost words and probabilities.
const row = await p.evaluate(() => {
  const words = [...document.querySelectorAll(".token")]
    .map((el, index) => ({ index, r: el.getBoundingClientRect(), el }))
    .filter(
      ({ el, r }) =>
        /^[A-Za-z]{2,}$/.test(el.querySelector(".token-text").textContent) &&
        r.top > 150 &&
        r.top < 560,
    );
  const rows = [];
  for (const w of words) {
    const same = rows.find((r) => Math.abs(r.top - w.r.top) < 8);
    if (same) same.indexes.push(w.index);
    else rows.push({ top: w.r.top, indexes: [w.index] });
  }
  rows.sort((a, b) => b.indexes.length - a.indexes.length || a.top - b.top);
  return rows[0]?.indexes ?? [];
});
if (row.length < 3) throw new Error("GPT-2 gave no row of three plain words to sweep across");
rects.sweep_words = await p.evaluate(
  ([indexes, scale]) =>
    indexes.map((i) => {
      const r = document.querySelectorAll(".token")[i].getBoundingClientRect();
      return {
        x: Math.round(r.x * scale),
        y: Math.round(r.y * scale),
        w: Math.round(r.width * scale),
        h: Math.round(r.height * scale),
      };
    }),
  [row.slice(0, 5), SCALE],
);
mark("sweep_start");
for (const [n, index] of row.slice(0, 5).entries()) {
  const word = p.locator(".token").nth(index).locator(".token-text");
  const at = await centre(word);
  await cursorTo(at.x - 8, at.y, n === 0 ? 1400 : 650);
  await p.mouse.move(at.x - 8, at.y);
  await wait(n === 0 ? 900 : 1000);
  mark(`sweep_${n + 1}`);
}
mark("sweep_end");
// Then the keyboard way: arrow across the words, the ghost words change at every step.
await hideCursor();
await p.locator(".token").nth(row[0]).focus();
await wait(900);
mark("arrows_start");
for (let i = 0; i < 6; i++) {
  await p.keyboard.press("ArrowRight");
  await wait(750);
}
mark("arrows_end");
await rectsOf("gpt2_card", ".voice:has(.token)", 1);
const gpt2Answer = await p.evaluate(() => {
  const el = document.querySelector(".voice:has(.token) .voice-text").cloneNode(true);
  for (const ghosts of el.querySelectorAll(".ghosts")) ghosts.remove();
  return el.textContent;
});
await p.waitForSelector("#ritual-end:not(:empty)", { timeout: MODEL_TIMEOUT });

// 7. Recorded voices of the first ritual (English): the cards, then the medium's calaveritas.
mark("gemma_glide_start");
await glide('.voice[data-step-id="gemma-1"]', 1500);
await rectsOf("gemma_cards", ".voice[data-state='recorded']", 4);
await wait(1500);
await glide('.voice[data-step-id="gemma-2"]', 1300);
await wait(900);
await glide('.voice[data-step-id="gemma-3"]', 1300);
await wait(1300);
mark("gemma_glide_end");
await jump('.voice[data-step-id="medium"]');
await wait(400);
mark("medium_en_start");
await rectsOf("medium_en", ".voice[data-step-id='medium']", 1);
await wait(3000);
mark("medium_en_glide_start");
await glide("#ritual-end", 6000);
mark("medium_en_glide_end");
await wait(1000);

// 8. A second ritual in Spanish: the cards land the moment GPT-2 finishes (the camera waits
//    just below its card); then the medium's Spanish calaveritas.
await jump("#offering");
await wait(300);
await p.locator('label:has(input[name="language"][value="es"])').click();
await p.locator("label.choice", { hasText: QUESTION.es }).click();
await p.getByRole("button", { name: "Offer it to the altar" }).click();
await p.waitForSelector(".token", { timeout: MODEL_TIMEOUT });
// The camera follows the tail of GPT-2's answer as it grows, so the cards land in view.
await p.evaluate(() => {
  window.demoFollow = true;
  const tail = () => {
    const card = document.querySelector(".voice:has(.token)");
    return card.getBoundingClientRect().bottom + scrollY;
  };
  const step = () => {
    if (!window.demoFollow) return;
    scrollTo(0, scrollY + (tail() - 380 - scrollY) * 0.12);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
mark("cards_wait_start");
await p.waitForSelector('.voice[data-step-id="gemma-1"]', { timeout: MODEL_TIMEOUT });
await p.evaluate(() => (window.demoFollow = false));
mark("cards_land");
await rectsOf("cards_landed", ".voice[data-state='recorded']", 4);
await wait(2600);
await glide('.voice[data-step-id="gemma-1"]', 1500);
await wait(1300);
mark("cards_es_end");
const gpt2AnswerEs = await p.evaluate(() => {
  const el = document.querySelector(".voice:has(.token) .voice-text").cloneNode(true);
  for (const ghosts of el.querySelectorAll(".ghosts")) ghosts.remove();
  return el.textContent;
});
await p.waitForSelector("#ritual-end:not(:empty)", { timeout: MODEL_TIMEOUT });
await jump('.voice[data-step-id="medium"]');
await wait(400);
mark("medium_es_start");
await wait(3000);
mark("medium_es_glide_start");
await glide("#ritual-end", 6000);
mark("medium_es_glide_end");
await wait(1000);

// 9. The about panel: what stays on the device, then "Forget the models" with the real result.
await glide(0, 800);
await wait(400);
await rectsOf("about_link", "#about-link", 1);
mark("about_cursor_start");
await clickWithCursor(p.locator("#about-link"), 1300);
mark("about_open");
await wait(600);
await jump("#about", 60);
await rectsOf("privacy", "#about > p", 1);
await wait(2600);
mark("about_privacy_end");
await glide("#stored-models-forget", 2400, 330);
mark("stored_start");
await wait(1400);
await clickWithCursor(p.locator("#stored-models-forget"), 1300);
mark("forget_click");
await p.waitForFunction(
  () => document.getElementById("stored-models-result").textContent.length > 0,
  null,
  { timeout: 60_000 },
);
await rectsOf("stored_result", "#stored-models-result", 1);
const forgetResult = await p.evaluate(
  () => document.getElementById("stored-models-result").textContent,
);
mark("forget_result");
await wait(3200);
mark("stored_end");
await hideCursor();
await wait(500);

await cdp.send("Page.stopScreencast");
await ctx.close();
void feed(lastFrame, 15);
await queue;
encoder.stdin.end();
await encoderClosed;

const markers = Object.fromEntries(
  Object.entries(markAt).map(([name, t]) => [name, Number((t - firstTimestamp).toFixed(2))]),
);
writeFileSync(
  `${RAW}/markers.json`,
  `${JSON.stringify({ markers, rects, gpt2Answer, gpt2AnswerEs, forgetResult }, null, 2)}\n`,
);
console.log(`${frameCount} frames → ${RAW}/raw.mp4`);
console.log("Markers:", JSON.stringify(markers));
console.log(`GPT-2 answer: ${JSON.stringify(gpt2Answer)}`);
console.log(`GPT-2 answer (Spanish ritual): ${JSON.stringify(gpt2AnswerEs)}`);
console.log(`Forget result: ${JSON.stringify(forgetResult)}`);
