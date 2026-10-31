// Raw footage for the demo video (step 1 of 2; tools/demo-edit.mjs is step 2).
// Records the REAL production site in headless Chromium (no GPU: GPT-2 runs live on WebAssembly,
// the Gemma voices replay their recordings, labelled as such). Nothing is faked or stubbed.
//   npm run build && npx vite preview --outDir dist --port 4196 --strictPort
//   node tools/demo-capture.mjs http://localhost:4196/OfrendaDeLosModelos/ <out-dir>
// It runs one unrecorded ritual first (profile kept in <out-dir>/browser-profile, so GPT-2 is
// cached), then films every beat with generous holds and writes to <out-dir>/raw/:
//   raw.mp4 (1920x1080, 30 fps), markers.json (seconds into raw.mp4 for each beat, plus the text
//   GPT-2 wrote), slide-title.png and slide-end.png (3840x2160 stills of the two text slides).
// A soft cursor drawn in the page's overlay layer glides to what is about to be clicked or
// focused. Set CHROMIUM_PATH to override /opt/pw-browsers/chromium. Needs ffmpeg on PATH.
// Not part of the site or CI.
/* global document, performance, requestAnimationFrame, scrollTo, scrollY, innerHeight */
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const [BASE, OUT] = process.argv.slice(2);
if (BASE === undefined || OUT === undefined) {
  console.error("usage: node tools/demo-capture.mjs <site-url> <out-dir>");
  process.exit(1);
}
const RAW = `${OUT}/raw`;
const QUESTION = "What do you remember?";
const MODEL_TIMEOUT = 30 * 60_000;
const VIEWPORT = { width: 1280, height: 720 };
const SCALE = 1.5; // 1280x720 CSS pixels -> 1920x1080 frames

const TITLE_CARD = [
  ["h1", "Ofrenda de los Modelos"],
  ["p", "An artistic tribute to the memory of AI models, inspired by Día de Muertos"],
];
const END_CARD = [
  ["h1", "Closed models fade."],
  ["h1", "Open weights can always come back."],
  ["small", "adricasi.github.io/OfrendaDeLosModelos"],
];

const ctx = await chromium.launchPersistentContext(`${OUT}/browser-profile`, {
  viewport: VIEWPORT,
  reducedMotion: "no-preference",
  bypassCSP: true, // only lets the overlay layer add its stylesheet; the site is unchanged
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  // Frames come out at 1920x1080 while the page keeps its 1280x720 layout.
  args: [`--force-device-scale-factor=${SCALE}`],
  headless: true,
});
const p = ctx.pages()[0] ?? (await ctx.newPage());

// The overlay layer (text slides, cursor) lives in one fixed element above the page.
async function installLayer(page) {
  await page.evaluate(() => {
    const css = document.createElement("style");
    css.textContent = `
      #demo-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:var(--font)}
      #demo-card{position:absolute;inset:0;display:grid;place-content:center;gap:18px;text-align:center;
        background:radial-gradient(circle at 50% 45%,#2b1630,#0f0810 70%);color:#fff4e0;opacity:0}
      #demo-card h1+h1{margin-top:-14px}
      #demo-card h1{font-family:var(--font-display);font-weight:400;font-size:64px;margin:0;color:var(--marigold-light)}
      #demo-card p{font-size:26px;margin:0;max-width:900px}
      #demo-card small{font-size:19px;opacity:.75}
      #demo-cursor{position:absolute;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;
        background:radial-gradient(circle,rgb(255 244 224 / .9) 0 3px,rgb(255 244 224 / .22) 4px);
        border:2px solid rgb(255 244 224 / .8);box-shadow:0 0 16px rgb(255 190 110 / .55);
        opacity:0;transition:opacity .5s,transform .16s}
      #demo-cursor[data-press]{transform:scale(.72)}`;
    document.head.append(css);
    const layer = document.createElement("div");
    layer.id = "demo-layer";
    for (const id of ["demo-card", "demo-cursor"]) {
      const div = document.createElement("div");
      div.id = id;
      layer.append(div);
    }
    document.body.append(layer);
  });
}
// Card content is a list of [tag, text] lines; text only, never HTML.
const showCard = (page, lines) =>
  page.evaluate((l) => {
    const el = document.getElementById("demo-card");
    el.replaceChildren(
      ...l.map(([tag, text]) => Object.assign(document.createElement(tag), { textContent: text })),
    );
    el.style.opacity = "1";
  }, lines);

// Eased scroll so the camera moves like a hand, not a jump; never aims past the end of the page.
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
          const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          scrollTo(0, y0 + (y1 - y0) * e);
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    [target, ms, gap],
  );
const wait = (ms) => p.waitForTimeout(ms);

// The cursor: eased glide to a viewport point (it only draws; the real mouse moves on click).
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
// Click with a small press animation on the cursor, then let it settle.
const press = async ({ x, y }) => {
  await p.evaluate(() => document.getElementById("demo-cursor").setAttribute("data-press", ""));
  await p.mouse.click(x, y, { delay: 120 });
  await p.evaluate(() => document.getElementById("demo-cursor").removeAttribute("data-press"));
};
const hideCursor = () =>
  p.evaluate(() => (document.getElementById("demo-cursor").style.opacity = "0"));

// Beat markers, in seconds on the wall clock; converted to seconds into raw.mp4 at the end.
const frames = []; // {t}: the JPEGs are written to <out>/raw/frames as they arrive
const framesDir = `${RAW}/frames`;
const markAt = {};
const mark = (name) => {
  markAt[name] = Date.now() / 1000;
};
const cdp = await ctx.newCDPSession(p);
cdp.on("Page.screencastFrame", async (f) => {
  writeFileSync(
    `${framesDir}/f${String(frames.length).padStart(5, "0")}.jpg`,
    Buffer.from(f.data, "base64"),
  );
  frames.push({ t: f.metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});

// Warm-up (not recorded): one full ritual online, so GPT-2 is cached and loads fast in the take.
console.log("Warm-up: one ritual online to cache GPT-2 (the first run downloads ~281 MB).");
await p.goto(BASE);
await p.waitForSelector("#places > li");
await p.getByLabel(QUESTION).check();
await p.getByRole("button", { name: "Offer it to the altar" }).click();
await p.waitForSelector("#ritual-end:not(:empty)", { timeout: MODEL_TIMEOUT });

// Fresh page for the take; the two text slides are stills at 3840x2160 for the editor's slow zoom.
await p.goto(BASE);
await p.waitForSelector("#places > li");
await installLayer(p);
// Blank room below the page, so the camera can frame a card that is still growing.
await p.evaluate(() => {
  const spacer = document.createElement("div");
  spacer.style.height = "900px";
  document.body.append(spacer);
});
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
const stills = await ctx.newPage();
const stillsCdp = await ctx.newCDPSession(stills);
await stillsCdp.send("Emulation.setDeviceMetricsOverride", {
  ...VIEWPORT,
  deviceScaleFactor: 3,
  mobile: false,
});
await stills.goto(BASE);
await stills.waitForSelector("#places > li");
await stills.evaluate(() => document.fonts.ready);
await installLayer(stills);
for (const [name, lines] of [
  ["title", TITLE_CARD],
  ["end", END_CARD],
]) {
  await showCard(stills, lines);
  const shot = await stillsCdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${RAW}/slide-${name}.png`, Buffer.from(shot.data, "base64"));
}
await stills.close();
await p.bringToFront();

await cdp.send("Page.startScreencast", {
  format: "jpeg",
  quality: 82,
  maxWidth: VIEWPORT.width * SCALE,
  maxHeight: VIEWPORT.height * SCALE,
});
await wait(1000);

// 1. The altar: one long, slow glide over the papel picado, the arch, the candles and the places.
mark("altar_glide_start");
await glide(0, 10);
await glide("#places", 15_000);
mark("altar_glide_end");
await wait(1000);

// 2. The dark frames.
await p.evaluate(() => (document.getElementById("dark-frames-section").hidden = false));
mark("dark_glide_start");
await glide("#dark-frames-section", 2800, -10);
mark("dark_glide_end");
await wait(3500);
mark("dark_hold_end");

// 3. The offering: the cursor chooses the question, then the button.
await p.evaluate(() => (document.getElementById("dark-frames-section").hidden = true));
await wait(500);
mark("offering_glide_start");
await glide("#offering", 3000);
mark("offering_glide_end");
await wait(1800);
const radio = await centre(p.locator("label.choice", { hasText: QUESTION }));
mark("question_cursor_start");
await cursorTo(radio.x - 40, radio.y, 1600);
await wait(400);
await press(radio);
mark("question_click");
await wait(1400);
// The button sits below the fold of the form: bring it into the lower part of the frame.
const offerButton = p.getByRole("button", { name: "Offer it to the altar" });
const buttonY = (await centre(offerButton)).y;
if (buttonY > 540) {
  const y0 = await p.evaluate(() => scrollY);
  await glide(y0 + buttonY - 540, 1400);
  await wait(500);
}
const button = await centre(offerButton);
mark("offer_cursor_start");
await cursorTo(button.x, button.y, 1500);
await wait(500);
await press(button);
mark("offer_click");
await hideCursor();
await wait(1200);

// 4. GPT-2 on WebAssembly: frame its card while it loads, film from the first word.
await p.waitForSelector("#ritual:not([hidden])");
await glide("#ritual-voices", 1400);
await p.waitForSelector(".token", { timeout: MODEL_TIMEOUT });
mark("gpt2_first_token");
await p.waitForFunction(() => document.querySelectorAll(".token").length >= 12, null, {
  timeout: MODEL_TIMEOUT,
});
await wait(3500);
// The ghost words with the likeliest alternatives among the first words: a reading choice,
// the numbers are the model's own.
const ranked = await p.evaluate(() => {
  const percent = (el) => (el.textContent.startsWith("<") ? 0 : Number.parseFloat(el.textContent));
  return [...document.querySelectorAll(".token")]
    .slice(0, 12)
    .map((el, index) => ({
      index,
      word: /^[A-Za-z]{3,}$/.test(el.querySelector(".token-text").textContent),
      top: Math.max(...[...el.querySelectorAll(".ghost-p")].map(percent)),
    }))
    .filter((t) => t.word)
    .sort((x, y) => y.top - x.top)
    .map((t) => t.index);
});
if (ranked.length < 2) throw new Error("GPT-2 gave too few plain words to show ghost words on");
for (const [n, index] of ranked.slice(0, 2).entries()) {
  const token = p.locator(".token").nth(index);
  const at = await centre(token);
  mark(`ghost${n + 1}_cursor_start`);
  await cursorTo(at.x, at.y + 4, n === 0 ? 1700 : 1300);
  await wait(300);
  await token.focus();
  mark(`ghost${n + 1}_focus`);
  await wait(3300);
}
mark("ghost_end");
await hideCursor();

// 5. Gemma 1 to 3 (recordings, labelled "Recorded voice" by the page).
await p.waitForSelector('.voice[data-step-id="gemma-1"]', { timeout: MODEL_TIMEOUT });
mark("gemma_glide_start");
await glide('.voice[data-step-id="gemma-1"]', 1600);
await wait(900);
await p.waitForSelector('.voice[data-step-id="gemma-2"]', { timeout: MODEL_TIMEOUT });
await glide('.voice[data-step-id="gemma-2"]', 1500);
await wait(600);
await p.waitForSelector('.voice[data-step-id="gemma-3"]', { timeout: MODEL_TIMEOUT });
await glide('.voice[data-step-id="gemma-3"]', 1500);
await wait(1800);
mark("gemma3_end");

// 6. The medium's calaveritas: jump there (the editor covers it with the roles slide), hold on
//    the "Recorded voice" label, then drift down over the cards.
await p.waitForSelector("#ritual-end:not(:empty)", { timeout: MODEL_TIMEOUT });
mark("calaverita_visible");
await p.evaluate(() => {
  const medium = document.querySelector('.voice[data-step-id="medium"]');
  scrollTo(0, scrollY + medium.getBoundingClientRect().top - 40);
});
await wait(500);
mark("medium_jump");
await wait(3600);
mark("medium_glide_start");
await glide("#ritual-end", 7000);
mark("medium_glide_end");
await wait(1500);

// What GPT-2 wrote in this take, as the page shows it (ghost words left out).
const answer = await p.evaluate(() => {
  const el = document.querySelector(".voice:has(.token) .voice-text").cloneNode(true);
  for (const ghosts of el.querySelectorAll(".ghosts")) ghosts.remove();
  return el.textContent;
});
await cdp.send("Page.stopScreencast");
await ctx.close();

// Variable-rate screencast frames -> constant 30 fps H.264 (high quality: the editor re-encodes).
const dir = framesDir;
let list = "";
frames.forEach((f, i) => {
  const name = `f${String(i).padStart(5, "0")}.jpg`;
  const next = frames[i + 1];
  list += `file '${name}'\nduration ${(next ? next.t - f.t : 0.5).toFixed(3)}\n`;
});
list += `file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
writeFileSync(`${dir}/list.txt`, list);
execFileSync("ffmpeg", [
  ...["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`],
  ...["-vf", "fps=30,scale=1920:1080:flags=lanczos"],
  ...["-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p", "-crf", "14"],
  `${RAW}/raw.mp4`,
]);
rmSync(dir, { recursive: true, force: true });

const t0 = frames[0].t;
const markers = Object.fromEntries(
  Object.entries(markAt).map(([name, t]) => [name, Number((t - t0).toFixed(2))]),
);
writeFileSync(
  `${RAW}/markers.json`,
  `${JSON.stringify({ markers, gpt2Answer: answer }, null, 2)}\n`,
);
const seconds = frames.at(-1).t - t0;
console.log(`${frames.length} frames (${(frames.length / seconds).toFixed(1)}/s) → ${RAW}/raw.mp4`);
console.log("Markers:", JSON.stringify(markers));
console.log(`GPT-2 answer: ${JSON.stringify(answer)}`);
