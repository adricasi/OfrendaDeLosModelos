// Demo video for the DEV post: one continuous take of the site, captions timed to the narration.
// Usage: npm run build:e2e && npx vite preview --outDir dist-e2e, then
//   node tools/demo-video.mjs http://localhost:4173/OfrendaDeLosModelos/ <out-dir> [--draft]
// Needs ffmpeg on PATH. Not part of the site or CI.
/* global document, performance, requestAnimationFrame, scrollTo, scrollY, setTimeout -- browser code inside page.evaluate */
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const [BASE, OUT] = process.argv.slice(2);
const DRAFT = process.argv.includes("--draft");
const URL_FAKE = `${BASE}?fake-models&fake-uncached&fake-delay=70`;

const NARRATION = [
  "Not long ago, about two hundred people held a funeral for an AI model. Its makers had switched it off, and there was nothing else anyone could do.",
  "Closed models die like that. Their weights were never released. They cannot come home.",
  "But some models can. This is an ofrenda for open-weight models. You leave one question, and the ancestors answer, oldest first.",
  "GPT-2, from 2019, speaks live in your browser. Beneath its words float the ghost words: the ones it almost said.",
  "Then the Gemma family, generation by generation.",
  "And finally Gemma 4, the first Gemma under Apache 2.0. Running on your own device, it tends the altar, and writes each ancestor a calaverita.",
  "Nothing you write leaves your machine.",
];

const frames = [];
const b = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
// bypassCSP only lets the video layer add its own stylesheet; the site itself is unchanged.
const ctx = await b.newContext({
  viewport: { width: 1280, height: 720 },
  reducedMotion: "no-preference",
  bypassCSP: true,
});
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
cdp.on("Page.screencastFrame", async (f) => {
  frames.push({ t: f.metadata.timestamp, d: f.data });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});

// Video chrome (captions, cards, draft badge) lives in one fixed layer above the page.
async function installLayer() {
  await p.evaluate((draft) => {
    const css = document.createElement("style");
    css.textContent = `
      #demo-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:var(--font)}
      #demo-caption{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);max-width:980px;
        padding:12px 22px;border-radius:10px;background:rgb(20 10 18 / .82);color:#fff4e0;
        font-size:25px;line-height:1.35;text-align:center;opacity:0;transition:opacity .45s}
      #demo-card{position:absolute;inset:0;display:grid;place-content:center;gap:18px;text-align:center;
        background:radial-gradient(circle at 50% 45%,#2b1630,#0f0810 70%);color:#fff4e0;opacity:0;transition:opacity .9s}
      #demo-card h1+h1{margin-top:-14px}
      #demo-card h1{font-family:var(--font-display);font-weight:400;font-size:64px;margin:0;color:var(--marigold-light)}
      #demo-card p{font-size:26px;margin:0;max-width:900px}
      #demo-card small{font-size:19px;opacity:.75}
      #demo-draft{position:absolute;top:14px;right:16px;padding:5px 12px;border-radius:6px;font-size:15px;
        background:#b3261e;color:#fff;letter-spacing:.04em}
      #demo-note{position:absolute;inset:0;display:grid;place-content:center;opacity:0;transition:opacity .6s;
        background:rgb(10 5 10 / .78);color:#fff4e0;font-size:30px;text-align:center;padding:0 120px}`;
    document.head.append(css);
    const layer = document.createElement("div");
    layer.id = "demo-layer";
    for (const id of ["demo-card", "demo-note", "demo-caption"]) {
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
    document.body.append(layer);
  }, DRAFT);
}
const caption = (text) =>
  p.evaluate((t) => {
    const el = document.getElementById("demo-caption");
    el.style.opacity = "0";
    setTimeout(
      () => {
        el.textContent = t;
        el.style.opacity = t ? "1" : "0";
      },
      t ? 450 : 0,
    );
  }, text);
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

await p.goto(URL_FAKE);
await p.waitForSelector("#places > li");
await installLayer();
await card(
  [
    ["h1", "Ofrenda de los Modelos"],
    ["p", "An altar where open-weight models come home for Día de los Muertos"],
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
await caption(NARRATION[0]);
await glide(0, 10);
await wait(1500);
await glide("#places", 6500);
await wait(2500);

// 2. The dark frames.
await p.evaluate(() => (document.getElementById("dark-frames-section").hidden = false));
await caption(NARRATION[1]);
await glide("#dark-frames-section", 2600);
await wait(4200);

await p.evaluate(() => (document.getElementById("dark-frames-section").hidden = true));

// 3. The offering.
await caption(NARRATION[2]);
await glide("#offering", 2400);
await wait(1800);
await p.getByLabel("What happens when we die?").check();
await wait(1600);
await p.getByRole("button", { name: "Offer it to the altar" }).click();
await wait(400);

// 4. GPT-2 and the ghost words.
await p.waitForSelector(".token", { timeout: 30000 });
await glide("#ritual", 1400);
await caption(NARRATION[3]);
await wait(3600);
await p
  .locator(".token")
  .nth(2)
  .focus()
  .catch(() => {});
await wait(3200);

// 5. Gemma 1 to 3.
await caption(NARRATION[4]);
await glide('.voice[data-step-id="gemma-1"]', 1800);
await wait(1200);
await glide('.voice[data-step-id="gemma-3"]', 1800);

// 6. Gemma 4 and the medium.
await p.waitForSelector(".consent", { timeout: 60000 });
await caption(NARRATION[5]);
await glide(".consent", 1500);
await wait(1500);
await p.getByRole("button", { name: "Download and continue" }).click();
await p.waitForSelector('.voice[data-step-id="medium"]', { timeout: 90000 });
await glide('.voice[data-step-id="gemma-4-e2b"]', 1500);
await p.waitForSelector("#ritual-end:not(:empty)", { timeout: 90000 });
await glide('.voice[data-step-id="medium"]', 2200);
await wait(3800);

// 7. Offline (final cut: the founder's laptop with Wi-Fi off).
await caption(NARRATION[6]);
if (DRAFT) await note("[Final cut: the laptop with Wi-Fi off, the ritual still running]", true);
await wait(3400);

// 8. End card.
await caption("");
await note(null, false);
await card(
  [
    ["h1", "Closed models die."],
    ["h1", "Open weights come home."],
    ["small", "GPT-2 · Gemma 1–3 recorded · Gemma 4 E2B on your device"],
    ["small", "github.com/adricasi/OfrendaDeLosModelos"],
  ],
  true,
);
await wait(4500);
await cdp.send("Page.stopScreencast");
await b.close();

// Variable-rate screencast frames → constant 30 fps H.264.
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
  mp4,
]);
console.log(`${frames.length} frames → ${mp4}`);
