// Demo video for the DEV post: one continuous take of the site, scenes timed to the narration.
// Draft (stand-in models): npm run build:e2e && npx vite preview --outDir dist-e2e, then
//   node tools/demo-video.mjs http://localhost:4173/OfrendaDeLosModelos/ <out-dir> --draft
// Final (real models, Chrome with WebGPU): npm run build && npx vite preview, then
//   node tools/demo-video.mjs http://localhost:4173/OfrendaDeLosModelos/ <out-dir> --live
//   It runs one ritual online first so the models and the service worker are cached (kept in
//   <out-dir>/browser-profile), then switches the browser offline and films the whole take.
// Real site in headless Chromium, no fake models (no GPU needed): npm run build, then
//   npx vite preview --outDir dist --port 4196 --strictPort and
//   node tools/demo-video.mjs http://localhost:4196/OfrendaDeLosModelos/ <out-dir> --real
//   It runs one unrecorded ritual first (kept in <out-dir>/browser-profile) so GPT-2 is cached,
//   then films the take: title slide, the site, two diagram slides (docs/images) and an end
//   slide. Without WebGPU GPT-2 runs live on WebAssembly and the Gemma voices replay their
//   recordings, labelled as such. Set CHROMIUM_PATH to override /opt/pw-browsers/chromium.
// Add --narration <dir> with narration_01.mp3 … narration_07.mp3 (one per paragraph below):
//   each scene then lasts at least as long as its paragraph, and the voice is mixed in.
// Needs ffmpeg on PATH. Not part of the site or CI.
/* global document, navigator, performance, requestAnimationFrame, scrollTo, scrollY, setTimeout -- browser code inside page.evaluate */
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const [BASE, OUT] = process.argv.slice(2);
const DRAFT = process.argv.includes("--draft");
const LIVE = process.argv.includes("--live");
const REAL = process.argv.includes("--real");
const URL = LIVE || REAL ? BASE : `${BASE}?fake-models&fake-uncached&fake-delay=70`;
// Real models can take minutes on a first download; the stand-ins answer in seconds.
const MODEL_TIMEOUT = LIVE || REAL ? 30 * 60_000 : 90_000;
const QUESTION = REAL ? "What do you remember?" : "What happens when we die?";
// Slides for --real: full-screen diagrams from the repository, loaded into the page as data: URIs.
const SLIDE_FILES = {
  roles: "docs/images/diagram-gemma-roles.png",
  architecture: "docs/images/diagram-architecture.png",
};
const narrationArg = process.argv.indexOf("--narration");
const NARRATION_DIR = narrationArg > 0 ? process.argv[narrationArg + 1] : null;

const NARRATION = [
  "In August 2025, about two hundred people held a funeral for an AI model. Its makers had switched it off, and there was nothing else anyone could do.",
  "Their weights were never released.",
  "But some models can. This is an ofrenda for open-weight models. You leave one question, and the ancestors answer, oldest first.",
  "GPT-2, from 2019, speaks live in your browser. Beneath its words float the ghost words: the ones it almost said.",
  "Then the Gemma family, generation by generation.",
  "And finally Gemma 4, the first Gemma under Apache 2.0. Running on your own device, it tends the altar, and writes each ancestor a calaverita.",
  "Nothing you write leaves your machine.",
];
// With the older, longer last audio file (--draft/--live) it also says the end card's line
// ("Closed models fade. Open weights can always come back."); the card appears in the pause
// before it. With --real the file is trimmed and the end card is silent.
const END_CARD_AFTER = 2.4;
const PAUSE_AFTER_PARAGRAPH = 0.5;

const narrationFiles = NARRATION.map((_, i) => `${NARRATION_DIR}/narration_0${i + 1}.mp3`);
const narrationSeconds = NARRATION_DIR
  ? narrationFiles.map((file) =>
      Number(
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          file,
        ]).toString(),
      ),
    )
  : null;
const paragraphStart = [];

const frames = [];
// bypassCSP only lets the video layer add its own stylesheet; the site itself is unchanged.
const contextOptions = {
  viewport: { width: 1280, height: 720 },
  reducedMotion: "no-preference",
  bypassCSP: true,
};
// Live: installed Chrome, headed so WebGPU uses the real GPU, with a profile that keeps the
// model cache between runs. Real: headless Chromium (no WebGPU), same persistent profile.
const ctx = REAL
  ? await chromium.launchPersistentContext(`${OUT}/browser-profile`, {
      ...contextOptions,
      executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
      headless: true,
    })
  : LIVE
    ? await chromium.launchPersistentContext(`${OUT}/browser-profile`, {
        ...contextOptions,
        channel: "chrome",
        headless: false,
      })
    : await (
        await chromium.launch(
          process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
        )
      ).newContext(contextOptions);
const p = ctx.pages()[0] ?? (await ctx.newPage());
const cdp = await ctx.newCDPSession(p);
cdp.on("Page.screencastFrame", async (f) => {
  frames.push({ t: f.metadata.timestamp, d: f.data });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});

// Video chrome (title and end cards, badges) lives in one fixed layer above the page.
async function installLayer() {
  const slides = Object.fromEntries(
    Object.entries(SLIDE_FILES).map(([key, file]) => [
      key,
      `data:image/png;base64,${readFileSync(path.join(import.meta.dirname, "..", file)).toString("base64")}`,
    ]),
  );
  await p.evaluate(
    ([draft, offline, slideImages]) => {
      const css = document.createElement("style");
      css.textContent = `
      #demo-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:var(--font)}
      #demo-card{position:absolute;inset:0;display:grid;place-content:center;gap:18px;text-align:center;
        background:radial-gradient(circle at 50% 45%,#2b1630,#0f0810 70%);color:#fff4e0;opacity:0;transition:opacity .9s}
      #demo-card h1+h1{margin-top:-14px}
      #demo-card h1{font-family:var(--font-display);font-weight:400;font-size:64px;margin:0;color:var(--marigold-light)}
      #demo-card p{font-size:26px;margin:0;max-width:900px}
      #demo-card small{font-size:19px;opacity:.75}
      #demo-slide{position:absolute;inset:0;display:grid;place-items:center;opacity:0;transition:opacity .9s;
        background:radial-gradient(circle at 50% 40%,#2b1630,#0f0810 75%)}
      #demo-slide img{position:absolute;max-width:100%;max-height:100%;object-fit:contain;opacity:0}
      #demo-draft{position:absolute;top:14px;right:16px;padding:5px 12px;border-radius:6px;font-size:15px;
        background:#b3261e;color:#fff;letter-spacing:.04em}
      #demo-note{position:absolute;inset:0;display:grid;place-content:center;opacity:0;transition:opacity .6s;
        background:rgb(10 5 10 / .78);color:#fff4e0;font-size:30px;text-align:center;padding:0 120px}`;
      document.head.append(css);
      const layer = document.createElement("div");
      layer.id = "demo-layer";
      const slide = document.createElement("div");
      slide.id = "demo-slide";
      for (const [key, src] of Object.entries(slideImages)) {
        const img = document.createElement("img");
        img.dataset.slide = key;
        img.alt = "";
        img.src = src;
        slide.append(img);
      }
      layer.append(slide);
      for (const id of ["demo-card", "demo-note"]) {
        const div = document.createElement("div");
        div.id = id;
        layer.append(div);
      }
      if (draft) {
        const badge = document.createElement("div");
        badge.id = "demo-draft";
        badge.textContent = "DRAFT · stand-in model text";
        layer.append(badge);
      }
      if (offline) {
        const badge = document.createElement("div");
        badge.id = "demo-draft";
        badge.textContent = "Offline · the browser's network is switched off";
        layer.append(badge);
      }
      document.body.append(layer);
    },
    [DRAFT, LIVE, slides],
  );
  // Decode both diagrams now so a slide never pops in half-drawn.
  await p.evaluate(() =>
    Promise.all([...document.querySelectorAll("#demo-slide img")].map((img) => img.decode())),
  );
}
// Card content is a list of [tag, text] lines; text only, never HTML.
const card = (lines, show) =>
  p.evaluate(
    ([l, s]) => {
      const el = document.getElementById("demo-card");
      if (l)
        el.replaceChildren(
          ...l.map(([tag, text]) =>
            Object.assign(document.createElement(tag), { textContent: text }),
          ),
        );
      el.style.opacity = s ? "1" : "0";
    },
    [lines, show],
  );
// A full-screen diagram slide: pass its key to show it, null to fade it out.
const slide = (key) =>
  p.evaluate((k) => {
    for (const img of document.querySelectorAll("#demo-slide img"))
      img.style.opacity = img.dataset.slide === k ? "1" : "0";
    document.getElementById("demo-slide").style.opacity = k ? "1" : "0";
  }, key);
const note = (text, show) =>
  p.evaluate(
    ([t, s]) => {
      const el = document.getElementById("demo-note");
      if (t) el.textContent = t;
      el.style.opacity = s ? "1" : "0";
    },
    [text, show],
  );
// Eased scroll so the camera moves like a hand, not a jump.
const glide = (target, ms) =>
  p.evaluate(
    ([sel, dur]) =>
      new Promise((done) => {
        const y0 = scrollY;
        const el = typeof sel === "string" ? document.querySelector(sel) : null;
        const y1 = el ? y0 + el.getBoundingClientRect().top - 40 : sel;
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
    [target, ms],
  );
const wait = (ms) => p.waitForTimeout(ms);
const now = () => Date.now() / 1000;
// Marks where paragraph i starts; with narration, the scene holds until it is spoken.
const say = async (i) => {
  paragraphStart[i] = now();
};
const hold = async (i) => {
  if (!narrationSeconds) return;
  const left = paragraphStart[i] + narrationSeconds[i] + PAUSE_AFTER_PARAGRAPH - now();
  if (left > 0) await wait(left * 1000);
};

const offerQuestion = async (pause = 0) => {
  await p.getByLabel(QUESTION).check();
  await wait(pause);
  await p.getByRole("button", { name: "Offer it to the altar" }).click();
};
// Gemma 4 asks for consent only while it is not cached yet.
const acceptConsentIfAsked = async () => {
  await p.waitForSelector('.consent, .voice[data-step-id="medium"]', { timeout: MODEL_TIMEOUT });
  const consent = p.getByRole("button", { name: "Download and continue" });
  if (await consent.isVisible()) await consent.click();
};

if (LIVE || REAL) {
  console.log("Warm-up: one ritual online to cache the models (the first run downloads them).");
  await p.goto(URL);
  await p.waitForSelector("#places > li");
  await offerQuestion();
  await acceptConsentIfAsked();
  await p.waitForSelector("#ritual-end:not(:empty)", { timeout: MODEL_TIMEOUT });
  if (LIVE) {
    // The page registers its service worker after a WebGPU ritual; without it the offline reload fails.
    const cached = await p.evaluate(() =>
      Promise.race([
        navigator.serviceWorker.ready.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 15_000)),
      ]),
    );
    if (!cached)
      throw new Error("No service worker after the warm-up: is WebGPU on in this Chrome?");
    await ctx.setOffline(true);
    console.log("Offline. Recording.");
  } else console.log("Warm-up done. Recording.");
}
await p.goto(URL);
await p.waitForSelector("#places > li");
await installLayer();
await card(
  [
    ["h1", "Ofrenda de los Modelos"],
    ["p", "An artistic tribute to the memory of AI models, inspired by Día de Muertos"],
  ],
  true,
);
await wait(1200);
await cdp.send("Page.startScreencast", {
  format: "jpeg",
  quality: 88,
  maxWidth: 1280,
  maxHeight: 720,
});
await wait(2600);

// 1. The altar.
await card(null, false);
await say(0);
await glide(0, 10);
await wait(1500);
await glide("#places", 6500);
await wait(2500);

// 2. The dark frames.
await p.evaluate(() => (document.getElementById("dark-frames-section").hidden = false));
await hold(0);
await say(1);
await glide("#dark-frames-section", REAL ? 2200 : 2600);
await wait(REAL ? 1800 : 4200);
await hold(1);

// 3. The offering.
await p.evaluate(() => (document.getElementById("dark-frames-section").hidden = true));
await say(2);
await glide("#offering", 2400);
await wait(1800);
await offerQuestion(1600);
await wait(400);
if (REAL) {
  // The ritual card is already open while GPT-2 loads from the cache: show it.
  await p.waitForSelector("#ritual:not([hidden])");
  await glide("#ritual", 1400);
}

// 4. GPT-2 and the ghost words.
await p.waitForSelector(".token", { timeout: MODEL_TIMEOUT });
if (!REAL) await glide("#ritual", 1400);
await hold(2);
await say(3);
if (REAL) {
  // Live on WebAssembly: once a few words are out, focus the ones whose ghost words are most
  // likely (the page's own keyboard UI shows their probabilities), keeping the card in frame.
  await p.waitForFunction(() => document.querySelectorAll(".token").length >= 8, null, {
    timeout: MODEL_TIMEOUT,
  });
  await glide(".voice:has(.token)", 1200);
  await wait(1200);
  const ranked = await p.evaluate(() => {
    const percent = (el) =>
      el.textContent.startsWith("<") ? 0 : Number.parseFloat(el.textContent);
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
  for (const index of ranked.slice(0, 2)) {
    await p.locator(".token").nth(index).focus({ timeout: 5000 });
    await wait(3200);
  }
} else {
  await wait(3600);
  await p
    .locator(".token")
    .nth(2)
    .focus()
    .catch(() => {});
  await wait(3200);
}

// 5. Gemma 1 to 3.
await hold(3);
await say(4);
await p.waitForSelector('.voice[data-step-id="gemma-1"]', { timeout: MODEL_TIMEOUT });
await glide('.voice[data-step-id="gemma-1"]', 1800);
await wait(1200);
await p.waitForSelector('.voice[data-step-id="gemma-3"]', { timeout: MODEL_TIMEOUT });
await glide('.voice[data-step-id="gemma-3"]', 1800);

// 6. Gemma 4 and the medium.
if (REAL) {
  // The roles diagram covers the first seconds while the recordings finish behind it.
  await hold(4);
  await say(5);
  await slide("roles");
  await wait(3800);
  await slide(null);
  await wait(900);
}
await p.waitForSelector('.consent, .voice[data-step-id="gemma-4-e2b"]', {
  timeout: MODEL_TIMEOUT,
});
if (!REAL) {
  await hold(4);
  await say(5);
}
if (await p.locator(".consent").isVisible()) {
  await glide(".consent", 1500);
  await wait(1500);
}
await acceptConsentIfAsked();
await glide('.voice[data-step-id="gemma-4-e2b"]', 1500);
await p.waitForSelector("#ritual-end:not(:empty)", { timeout: MODEL_TIMEOUT });
await glide('.voice[data-step-id="medium"]', 2200);
await wait(narrationSeconds ? 1800 : 3800);

// 7. Offline: in the live take the whole ritual above ran with the network off.
//    Real: the architecture diagram ("what never exists", "stored in this browser").
await hold(5);
await say(6);
if (REAL) {
  await slide("architecture");
  await wait(narrationSeconds ? Math.max(narrationSeconds[6] * 1000, 3000) + 700 : 3400);
} else {
  if (DRAFT) await note("[Final cut: the laptop with Wi-Fi off, the ritual still running]", true);
  await wait(narrationSeconds ? END_CARD_AFTER * 1000 : 3400);
}

// 8. End card.
await note(null, false);
await card(
  REAL
    ? [
        ["h1", "Closed models fade."],
        ["h1", "Open weights can always come back."],
        ["small", "adricasi.github.io/OfrendaDeLosModelos"],
      ]
    : [
        ["h1", "Closed models fade."],
        ["h1", "Open weights can always come back."],
        ["small", "GPT-2 · Gemma 1–3 recorded · Gemma 4 E2B on your device"],
        ["small", "github.com/adricasi/OfrendaDeLosModelos"],
      ],
  true,
);
await slide(null);
if (REAL) await wait(4200);
else {
  await hold(6);
  await wait(narrationSeconds ? 1500 : 4500);
}
if (REAL) {
  // What GPT-2 wrote in this take, as the page shows it (ghost words left out).
  const answer = await p.evaluate(() => {
    const el = document.querySelector(".voice:has(.token) .voice-text").cloneNode(true);
    for (const ghosts of el.querySelectorAll(".ghosts")) ghosts.remove();
    return el.textContent;
  });
  console.log(`GPT-2 answer: ${JSON.stringify(answer)}`);
}
await cdp.send("Page.stopScreencast");
await ctx.close();
await ctx.browser()?.close(); // the draft launches its own browser; the live context owns none

// Variable-rate screencast frames → constant 30 fps H.264.
console.log("Scene starts (s):", paragraphStart.map((t) => (t - frames[0].t).toFixed(1)).join(" "));
const dir = `${OUT}/frames`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
let list = "";
frames.forEach((f, i) => {
  const name = `f${String(i).padStart(5, "0")}.jpg`;
  writeFileSync(`${dir}/${name}`, Buffer.from(f.d, "base64"));
  const next = frames[i + 1];
  list += `file '${name}'\nduration ${(next ? next.t - f.t : 0.5).toFixed(3)}\n`;
});
list += `file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
writeFileSync(`${dir}/list.txt`, list);
const mp4 = `${OUT}/demo${DRAFT ? "-draft" : ""}.mp4`;
const silent = NARRATION_DIR ? `${OUT}/video-only.mp4` : mp4;
execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  `${dir}/list.txt`,
  "-vf",
  "fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-crf",
  "22",
  "-movflags",
  "+faststart",
  silent,
]);
if (NARRATION_DIR) {
  // Each paragraph starts where its scene began in the take.
  const delays = paragraphStart.map((t) => Math.max(0, Math.round((t - frames[0].t) * 1000)));
  const mix =
    delays.map((ms, i) => `[${i + 1}:a]adelay=${ms}:all=1[a${i}]`).join(";") +
    `;${delays.map((_, i) => `[a${i}]`).join("")}amix=inputs=${delays.length}:normalize=0,apad[voice]`;
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    silent,
    ...narrationFiles.flatMap((file) => ["-i", file]),
    "-filter_complex",
    mix,
    "-map",
    "0:v",
    "-map",
    "[voice]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-shortest",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  rmSync(silent);
}
console.log(`${frames.length} frames → ${mp4}`);
