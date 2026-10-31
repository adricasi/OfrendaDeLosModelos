// Intro video for the DEV challenge (about 40 s, 1080p30): fast cuts of REAL interaction with the
// real site, cuts on the voice's phrases, punchy zoom punches, a title open and a short end card.
//   node tools/intro-edit.mjs <out-dir> [--narration <dir>] [--music <file>] [--output <file>]
// <out-dir> holds intro-raw/ from tools/intro-capture.mjs (raw.mp4 and markers.json). Writes
// <out-dir>/intro.mp4 (or --output) and <out-dir>/intro-edit/edl.json; clips and stills stay in
// <out-dir>/intro-edit. Without --narration the video is silent. With it, the folder must hold
// intro_01.mp3 … intro_07.mp3 (the seven lines below): the timeline re-times to their real
// durations and the voice is mixed in (two-pass loudnorm, I=-16, TP=-1.5). With --music the file is
// a bed under the voice, loudness-normalised to -24 LUFS and ducked by sidechain compression
// whenever the voice speaks (alone, without a voice, it sits at -18 LUFS). Until the voice files
// exist each line is estimated at 2.8 words per second plus 0.25 s.
// Only footage of the real site is used (GPT-2 live on WebAssembly; the Gemma voices and the medium
// are recordings and keep their "Recorded voice" label on screen); model text is never edited or
// sped up; only camera moves and cursor moves are ramped. Needs ffmpeg and the Chromium of
// tools/intro-capture.mjs (CHROMIUM_PATH overrides the path). --skip-picture reuses an existing
// intro-edit/picture.mp4 when only the sound changed; --skip-shots reuses the clips but rebuilds the picture. Not part of the site or CI.
/* global document -- browser code inside page.evaluate */
import path from "node:path";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const OUT = args[0];
const NARRATION_DIR = option("--narration");
const MUSIC = option("--music");
const SKIP_PICTURE = args.includes("--skip-picture");
const SKIP_SHOTS = args.includes("--skip-shots");
if (OUT === undefined || OUT.startsWith("--")) {
  console.error(
    "usage: node tools/intro-edit.mjs <out-dir> [--narration <dir>] [--music <file>] [--output <file>]",
  );
  process.exit(1);
}
const RAW = `${OUT}/intro-raw`;
const WORK = `${OUT}/intro-edit`;
const FINAL = option("--output") ?? `${OUT}/intro.mp4`;
const REPO = path.join(import.meta.dirname, "..");
const [W, H, FPS] = [1920, 1080, 30];
const DISSOLVE = 0.25; // between beats
const CUT = 0.04; // between shots inside a beat: a hard cut, one frame of dissolve
const LEAD = 0.1; // the voice starts this long after a beat's picture is in
const GAP = 0.3; // breath after a line
const TITLE_SECONDS = 1.3;
const LAST_TAIL = 1.3; // after the last line: the end card, then the fade out

// The seven lines (intro_01.mp3 … intro_07.mp3).
const LINES = [
  "What happens to an AI model when it's switched off?",
  "Closed models fade. But open ones can come back.",
  "Welcome to the Ofrenda: an altar where open-weight AI models answer your questions.",
  "Ask anything. Watch GPT-2 think, live in your browser, and see the ghost words it almost said.",
  "Hear the Gemma family, generation after generation, and let Gemma 4 tend the altar, writing each model a calaverita, right on your device.",
  "No server. No account. Nothing you write ever leaves your machine.",
  "Come, light a candle. Leave a question. Read the story behind it, and try the altar yourself.",
];

const { markers: m, rects: r } = JSON.parse(readFileSync(`${RAW}/markers.json`, "utf8"));
mkdirSync(WORK, { recursive: true });
const ff = (a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
const duration = (file) =>
  Number(
    execFileSync("ffprobe", [
      ...["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    ]).toString(),
  );
const rawSeconds = duration(`${RAW}/raw.mp4`);
const sourceVoice = (n) => `${NARRATION_DIR}/intro_0${n + 1}.mp3`;
// Text-to-speech files carry about 0.3 s of silence before and 0.5 s after the words: trim both
// ends so the cuts follow the voice, not the padding.
const voiceFile = (n) => `${WORK}/voice_0${n + 1}.wav`;
const estimated = NARRATION_DIR === null;
if (!estimated) {
  const trim = "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03";
  for (let n = 0; n < LINES.length; n++) {
    ff([
      ...["-i", sourceVoice(n)],
      ...["-af", `aresample=44100,${trim},areverse,${trim},areverse`, "-ac", "1", voiceFile(n)],
    ]);
  }
}
const lineSeconds = LINES.map((line, n) =>
  estimated ? line.split(/\s+/).length / 2.8 + 0.25 : duration(voiceFile(n)),
);

// Centre of the i-th rectangle recorded at a beat, as a fraction of the frame.
const at = (name, i = 0, fallback = [0.5, 0.5]) => {
  const rect = r[name]?.[i];
  return rect === undefined ? fallback : [(rect.x + rect.w / 2) / W, (rect.y + rect.h / 2) / H];
};

// Shots. `beat` is the line it plays under, `w` its share of the beat. Raw shots read raw.mp4 from
// `from` for as long as the slot needs (times `speed`), stopping at `until`; a longer shot holds its
// last frame. z is the zoom range, c the centre range (fractions of the frame); `punch` pushes in
// fast and settles. `accent` is a tiny word or two in the site's font, never a sentence.
const shots = [
  {
    beat: -1,
    name: "title",
    card: "title",
    w: 1,
    z: [1, 1.05],
    c: [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
  },
  // 1. What happens to an AI model when it's switched off? The empty frames, punch by punch.
  {
    beat: 0,
    name: "dark frames, arriving",
    w: 1,
    from: m.dark_glide_end - 0.6,
    until: m.dark_hold_end,
    z: [1, 1.18],
    c: [
      [0.5, 0.5],
      [0.5, 0.58],
    ],
  },
  {
    beat: 0,
    name: "an empty frame, close",
    w: 1,
    from: m.dark_glide_end + 1.2,
    until: m.dark_hold_end,
    z: [1.9, 2.1],
    c: [at("dark_frames", 0), at("dark_frames", 0)],
    punch: true,
  },
  {
    beat: 0,
    name: "another empty frame, close",
    w: 1,
    from: m.dark_glide_end + 2.2,
    until: m.dark_hold_end,
    z: [1.9, 2.1],
    c: [at("dark_frames", 2), at("dark_frames", 2)],
    punch: true,
  },
  // 2. Closed models fade. But open ones can come back.
  {
    beat: 1,
    name: "the frames, pulling back",
    w: 1.5,
    from: m.dark_hold_end - 2.4,
    until: m.dark_hold_end,
    z: [1.5, 1.05],
    c: [at("dark_frames", 3), [0.5, 0.55]],
  },
  {
    beat: 1,
    name: "a candle of the arch, close",
    w: 1,
    from: m.altar_glide_end + 0.6,
    until: m.places_hold_end,
    z: [2.6, 3],
    c: [at("place_candles", 1), at("place_candles", 1)],
    punch: true,
  },
  {
    beat: 1,
    name: "a candle at a place, close",
    w: 1,
    from: m.altar_glide_end + 2.4,
    until: m.places_hold_end,
    z: [2.6, 3],
    c: [at("place_candles", 2), at("place_candles", 2)],
    punch: true,
  },
  // 3. Welcome to Ofrenda de los Modelos: an altar where open-weight AI models answer your questions.
  {
    beat: 2,
    name: "papel picado, the altar glide",
    w: 1.8,
    from: m.altar_glide_start + 0.7,
    until: m.altar_glide_end,
    speed: 1.5,
    z: [1, 1.12],
    c: [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
    accent: "Ofrenda de los Modelos",
  },
  {
    beat: 2,
    name: "the arch, the altar glide",
    w: 1.8,
    from: m.altar_glide_start + 2.4,
    until: m.altar_glide_end,
    speed: 1.5,
    z: [1.1, 1.25],
    c: [
      [0.5, 0.4],
      [0.5, 0.36],
    ],
  },
  {
    beat: 2,
    name: "the places, candles lit",
    w: 2,
    from: m.altar_glide_end - 0.3,
    until: m.places_hold_end,
    z: [2.25, 2.4],
    c: [
      [0.4, 0.8],
      [0.52, 0.8],
    ],
  },
  // 4. Ask anything. Watch GPT-2 think, live in your browser, and see the ghost words it almost said.
  {
    beat: 3,
    name: "choose a question (cursor)",
    w: 2.4,
    from: m.question_cursor_start + 0.4,
    until: m.question_click + 0.9,
    speed: 1.4,
    z: [1, 1.25],
    c: [[0.5, 0.5], at("offered_es", 1, [0.45, 0.45])],
  },
  {
    beat: 3,
    name: "offer it to the altar (cursor)",
    w: 2,
    from: m.offer_cursor_start + 0.4,
    until: m.offer_click + 0.5,
    speed: 1.2,
    z: [1, 1.22],
    c: [
      [0.5, 0.5],
      [0.32, 0.78],
    ],
  },
  {
    beat: 3,
    name: "GPT-2's candle lights as it speaks",
    w: 2,
    from: m.place_speaking_start,
    until: m.place_speaking_end,
    z: [2.2, 2.5],
    c: [
      [0.34, 0.8],
      [at("places_speaking", 0, [0.31, 0.7])[0], 0.8],
    ],
  },
  {
    beat: 3,
    name: "GPT-2 streams live",
    w: 2,
    from: m.gpt2_first_token - 0.1,
    until: m.sweep_start,
    z: [1, 1.35],
    c: [
      [0.5, 0.5],
      [0.5, 0.45],
    ],
  },
  {
    beat: 3,
    name: "ghost words, hovering across words (close)",
    w: 3.2,
    from: m.sweep_1 - 1.1,
    until: m.sweep_end,
    speed: 1.2,
    z: [1.7, 1.9],
    c: [at("sweep_words", 0, [0.42, 0.4]), at("sweep_words", 3, [0.55, 0.4])],
    accent: "Ghost words",
  },
  // 5. Hear the Gemma family … let Gemma 4 tend the altar, writing each model a calaverita.
  {
    beat: 4,
    name: "the recorded voices land as GPT-2 finishes",
    w: 2.2,
    from: m.cards_land - 0.8,
    until: m.cards_es_end,
    z: [1, 1.1],
    c: [
      [0.5, 0.5],
      [0.5, 0.6],
    ],
    accent: "Recorded voices",
  },
  {
    beat: 4,
    name: "Gemma 1 to 3, recorded voices",
    w: 2,
    from: m.gemma_glide_start + 0.2,
    until: m.gemma_glide_end,
    speed: 1.3,
    z: [1, 1.08],
    c: [
      [0.5, 0.5],
      [0.5, 0.55],
    ],
  },
  {
    beat: 4,
    name: "the medium's calaveritas (English, a recording)",
    w: 2.3,
    from: m.medium_en_start + 0.1,
    until: m.medium_en_glide_end,
    z: [1, 1.1],
    c: [
      [0.5, 0.5],
      [0.5, 0.55],
    ],
    accent: "Calaveritas",
  },
  {
    beat: 4,
    name: "the medium's calaveritas (Spanish, a recording)",
    w: 2,
    from: m.medium_es_glide_start - 0.5,
    until: m.medium_es_glide_end,
    speed: 1.15,
    z: [1, 1.1],
    c: [
      [0.5, 0.5],
      [0.5, 0.55],
    ],
  },
  // 6. No server. No account. Nothing you write ever leaves your machine.
  {
    beat: 5,
    name: "open the about panel (cursor)",
    w: 1.3,
    from: m.about_cursor_start + 0.4,
    until: m.about_open + 0.6,
    z: [1, 1.25],
    c: [
      [0.5, 0.5],
      [0.38, 0.3],
    ],
  },
  {
    beat: 5,
    name: "the privacy text",
    w: 1.4,
    from: m.about_open + 0.9,
    until: m.about_privacy_end,
    z: [1.15, 1.4],
    c: [
      [0.5, 0.2],
      [0.5, 0.2],
    ],
  },
  {
    beat: 5,
    name: "Forget the models, with the page's own result",
    w: 1.5,
    from: m.forget_click - 0.5,
    until: m.stored_end,
    z: [1.85, 2],
    c: [
      [0.45, 0.67],
      [0.45, 0.67],
    ],
  },
  // 7. Light a candle. Leave a question. Read the story behind it, and try the altar yourself.
  {
    beat: 6,
    name: "a candle, close",
    w: 3,
    from: m.altar_glide_end + 3.2,
    until: m.places_hold_end,
    z: [2.4, 2.8],
    c: [at("place_candles", 2), at("place_candles", 2)],
    punch: true,
  },
  {
    beat: 6,
    name: "choose a question again (cursor)",
    w: 3,
    from: m.question_cursor_start + 0.9,
    until: m.question_click + 0.9,
    speed: 1.3,
    z: [1.15, 1.35],
    c: [at("offered_es", 1, [0.45, 0.45]), at("offered_es", 1, [0.45, 0.45])],
  },
  {
    beat: 6,
    name: "the altar glide, fast",
    w: 5,
    from: m.altar_glide_start + 2.2,
    until: m.altar_glide_end,
    speed: 2,
    z: [1, 1.12],
    c: [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
  },
  {
    beat: 6,
    name: "end card",
    card: "end",
    w: 7,
    z: [1.04, 1],
    c: [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
  },
];

// Time. The title comes first; each beat lasts its line plus a lead and a gap (the last one a long
// tail); its shots share the beat by weight. A dissolve (or a hard cut) is centred on each boundary,
// so a shot is on screen half of it longer on each side.
let t = TITLE_SECONDS;
const beatStart = [];
const beatLength = lineSeconds.map((seconds, n) => {
  const length = seconds + LEAD + GAP + (n === LINES.length - 1 ? LAST_TAIL : 0);
  beatStart[n] = t;
  t += length;
  return length;
});
const TOTAL = t;
const beatWeight = LINES.map((_, n) =>
  shots.filter((s) => s.beat === n).reduce((sum, s) => sum + s.w, 0),
);
let cursor = 0;
for (const [k, shot] of shots.entries()) {
  shot.slot =
    shot.beat === -1 ? TITLE_SECONDS : (beatLength[shot.beat] * shot.w) / beatWeight[shot.beat];
  shot.start = cursor;
  cursor += shot.slot;
  shot.end = cursor;
  shot.fade = k === 0 ? 0 : shot.beat !== shots[k - 1].beat ? DISSOLVE : CUT;
}
for (const [k, shot] of shots.entries()) {
  shot.shownFrom = shot.start - shot.fade / 2;
  const next = shots[k + 1];
  shot.length = shot.slot + shot.fade / 2 + (next ? next.fade / 2 : 0);
}
const frameCount = (seconds) => Math.round(seconds * FPS);
const encode = (file) => [
  ...["-an", "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-pix_fmt", "yuv420p"],
  ...["-r", String(FPS), file],
];

// Zoom and centre over the clip as a zoompan expression (a punch is fast out, slow in).
const pushIn = (shot, frames) => {
  const progress = `(on/${Math.max(1, frames - 1)})`;
  const eased = shot.punch
    ? `(1-pow(1-${progress},3))`
    : `(${progress}*${progress}*(3-2*${progress}))`;
  const mix = (pair) => `(${pair[0]}+(${pair[1]}-${pair[0]})*${eased})`;
  const zoom = mix(shot.z);
  const cx = mix(shot.c.map(([x]) => x));
  const cy = mix(shot.c.map(([, y]) => y));
  return `x='${cx}*iw-iw/(${zoom})/2':y='${cy}*ih-ih/(${zoom})/2':z='${zoom}'`;
};

// Stills in the site's fonts: the title and end cards (opaque, 3840x2160) and the accents
// (transparent, 1920x1080).
const font = (file) => readFileSync(`${REPO}/public/fonts/${file}`).toString("base64");
const css = `
@font-face{font-family:Gloock;src:url(data:font/woff2;base64,${font("Gloock-latin.woff2")}) format("woff2")}
@font-face{font-family:"Bricolage Grotesque";font-weight:400 700;
  src:url(data:font/woff2;base64,${font("BricolageGrotesque-latin.woff2")}) format("woff2")}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}
.big{font-family:Gloock,Georgia,serif;color:#ffc76b;margin:0;line-height:1.1;text-shadow:0 4px 28px rgb(0 0 0/.6)}
.small{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:500;color:#fff4e0;margin:0}
.card{background:radial-gradient(circle at 50% 45%,#2b1630,#0f0810 70%)}
.card .center{position:absolute;inset:0;display:grid;place-content:center;gap:16px;text-align:center}
.accent-scrim{position:absolute;left:0;bottom:0;width:62%;height:34%;
  background:linear-gradient(to top right,rgb(8 4 10/.8),rgb(8 4 10/.4) 55%,transparent)}
.accent{position:absolute;left:96px;bottom:78px;font-size:60px}`;
const pages = {
  title: `<style>${css}</style><body class="card"><div class="center">
    <h1 class="big" style="font-size:118px">Ofrenda de los Modelos</h1>
    <p class="small" style="font-size:30px;opacity:.8">An artistic tribute to the memory of AI models, inspired by Día de Muertos</p>
  </div></body>`,
  end: `<style>${css}</style><body class="card"><div class="center">
    <h1 class="big" style="font-size:104px">Ofrenda de los Modelos</h1>
    <p class="small" style="font-size:44px;margin-top:26px">adricasi.github.io/OfrendaDeLosModelos</p>
    <p class="small" style="font-size:26px;opacity:.7">Read the story on DEV · Hacktoberfest Open-Source AI Challenge</p>
  </div></body>`,
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const cardPage = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
for (const [name, html] of Object.entries(pages)) {
  await cardPage.setContent(html);
  await cardPage.evaluate(() => document.fonts.ready);
  await cardPage.screenshot({ path: `${WORK}/card-${name}.png` });
}
const accentPage = await browser.newPage({ viewport: { width: W, height: H } });
for (const [k, shot] of shots.entries()) {
  if (shot.accent === undefined) continue;
  await accentPage.setContent(
    `<style>${css}</style><div class="accent-scrim"></div><div class="big accent"></div>`,
  );
  await accentPage.evaluate((text) => {
    document.querySelector(".accent").textContent = text;
  }, shot.accent);
  await accentPage.evaluate(() => document.fonts.ready);
  shot.accentFile = `${WORK}/accent_${k}.png`;
  await accentPage.screenshot({ path: shot.accentFile, omitBackground: true });
}
await browser.close();

// Shots to clips.
const edl = [];
if (!SKIP_PICTURE) {
  for (const [k, shot] of shots.entries()) {
    const file = `${WORK}/shot_${k}.mp4`;
    const frames = frameCount(shot.length);
    shot.file = file;
    if (SKIP_SHOTS) {
      shot.source = "(clip reused)";
    } else if (shot.card !== undefined) {
      ff([
        ...["-i", `${WORK}/card-${shot.card}.png`],
        ...[
          "-vf",
          `zoompan=${pushIn(shot, frames)}:d=${frames}:s=${W}x${H}:fps=${FPS},setsar=1`,
          ...["-frames:v", String(frames)],
        ],
        ...encode(file),
      ]);
      shot.source = `${shot.card} card`;
    } else {
      const speed = shot.speed ?? 1;
      const want = shot.length * speed;
      const available = Math.min(shot.until, rawSeconds) - shot.from;
      const read = Math.min(want, available);
      const hold = (want - read) / speed;
      if (shot.from < 0 || available <= 0.4)
        throw new Error(`${shot.name}: no footage at ${shot.from}`);
      ff([
        ...["-ss", shot.from.toFixed(3), "-t", read.toFixed(3), "-i", `${RAW}/raw.mp4`],
        ...[
          "-vf",
          `setpts=PTS/${speed},fps=${FPS},scale=${W * 2}:${H * 2}:flags=bicubic,` +
            (hold > 0.02 ? `tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)},` : "") +
            `zoompan=${pushIn(shot, frames)}:d=1:s=${W}x${H}:fps=${FPS},setsar=1`,
          ...["-frames:v", String(frames)],
        ],
        ...encode(file),
      ]);
      shot.source = `raw ${shot.from.toFixed(2)}–${(shot.from + read).toFixed(2)} s${speed === 1 ? "" : ` at ${speed}x`}${hold > 0.02 ? `, last frame held ${hold.toFixed(1)} s` : ""}`;
    }
  }

  // Picture, pass 1: dissolves and hard cuts. Each fade starts where the clips so far end (their
  // real length in whole frames), so rounding can never leave a fade past the end of the picture.
  let cutGraph = "";
  let cutLast = "0:v";
  let cutLength = frameCount(shots[0].length) / FPS;
  for (let k = 1; k < shots.length; k++) {
    cutGraph += `[${cutLast}][${k}:v]xfade=transition=fade:duration=${shots[k].fade}:offset=${(cutLength - shots[k].fade).toFixed(3)}[x${k}]${k < shots.length - 1 ? ";" : ""}`;
    cutLast = `x${k}`;
    cutLength += frameCount(shots[k].length) / FPS - shots[k].fade;
  }
  ff([
    ...shots.flatMap((shot) => ["-i", shot.file]),
    ...["-filter_complex", cutGraph, "-map", `[${cutLast}]`],
    ...["-an", "-c:v", "libx264", "-preset", "fast", "-crf", "12", "-pix_fmt", "yuv420p"],
    ...["-r", String(FPS), `${WORK}/cut.mp4`],
  ]);
  // Pass 2: one grade, accents, fade in and out.
  let graph = "[0:v]eq=contrast=1.05:saturation=1.08,vignette=angle=PI/6[graded];";
  let last = "graded";
  let inputIndex = 1;
  const accentInputs = [];
  for (const shot of shots) {
    if (shot.accentFile === undefined) continue;
    const s = shot.start + shot.fade / 2 + 0.2;
    const to = shot.end - 0.1;
    accentInputs.push(
      ...["-framerate", String(FPS), "-loop", "1", "-t", TOTAL.toFixed(2), "-i", shot.accentFile],
    );
    graph +=
      `[${inputIndex}:v]format=rgba,fade=t=in:st=${s.toFixed(3)}:d=0.25:alpha=1,` +
      `fade=t=out:st=${(to - 0.25).toFixed(3)}:d=0.25:alpha=1[o${inputIndex}];` +
      `[${last}][o${inputIndex}]overlay=x=0:y='20*pow(1-clip((t-${s.toFixed(3)})/0.35,0,1),3)':eof_action=pass[y${inputIndex}];`;
    last = `y${inputIndex}`;
    inputIndex += 1;
  }
  graph += `[${last}]fade=t=in:st=0:d=0.4,fade=t=out:st=${(TOTAL - 0.8).toFixed(3)}:d=0.8,format=yuv420p[v]`;
  writeFileSync(`${WORK}/picture-graph.txt`, graph);
  ff([
    ...["-i", `${WORK}/cut.mp4`],
    ...accentInputs,
    ...["-filter_complex", graph, "-map", "[v]", "-t", TOTAL.toFixed(3)],
    ...encode(`${WORK}/picture.mp4`),
  ]);
}
for (const shot of shots) {
  edl.push({
    shot: shot.name,
    beat: shot.beat + 1,
    source: shot.source ?? "(picture reused)",
    zoom: `${shot.z[0]}→${shot.z[1]}${shot.punch ? " punch" : ""}`,
    shown: `${shot.shownFrom.toFixed(2)}–${(shot.shownFrom + shot.length).toFixed(2)} s`,
    accent: shot.accent ?? null,
  });
}

// Sound: silent unless narration and/or music are given.
const voiceStarts = LINES.map((_, n) => beatStart[n] + LEAD);
let measured = null;
const hasVoice = NARRATION_DIR !== null;
const audioInputs = [];
const chains = [];
let voiceLabel = null;
if (hasVoice) {
  for (let n = 0; n < LINES.length; n++) {
    if (!existsSync(voiceFile(n))) throw new Error(`Missing ${voiceFile(n)}`);
  }
  ff([
    ...LINES.flatMap((_, n) => ["-i", voiceFile(n)]),
    ...[
      "-filter_complex",
      LINES.map(
        (_, n) =>
          `[${n}:a]aresample=44100,adelay=${Math.round(voiceStarts[n] * 1000)}:all=1[a${n}]`,
      ).join(";") +
        `;${LINES.map((_, n) => `[a${n}]`).join("")}amix=inputs=${LINES.length}:normalize=0:duration=longest,` +
        `apad=whole_dur=${TOTAL.toFixed(3)},atrim=0:${TOTAL.toFixed(3)}[mix]`,
      ...["-map", "[mix]", "-ac", "1", "-c:a", "pcm_s16le", `${WORK}/mix.wav`],
    ],
  ]);
  const target = "I=-16:TP=-1.5:LRA=11";
  const first = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      `${WORK}/mix.wav`,
      "-af",
      `loudnorm=${target}:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  measured = JSON.parse(first.stderr.slice(first.stderr.lastIndexOf("{")));
  ff([
    ...["-i", `${WORK}/mix.wav`],
    ...[
      "-af",
      `loudnorm=${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}` +
        `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}` +
        `:offset=${measured.target_offset}:linear=true,aresample=44100,alimiter=limit=0.8:level=false`,
    ],
    ...["-c:a", "pcm_s16le", `${WORK}/voice.wav`],
  ]);
  audioInputs.push(...["-i", `${WORK}/voice.wav`]);
  voiceLabel = "1:a"; // input 0 of the final mux is the picture
}
if (MUSIC !== null) {
  const index = hasVoice ? 2 : 1;
  audioInputs.push(...["-stream_loop", "-1", "-i", MUSIC]);
  const level = hasVoice ? -24 : -18;
  chains.push(
    `[${index}:a]aresample=44100,atrim=0:${TOTAL.toFixed(3)},asetpts=PTS-STARTPTS,` +
      `loudnorm=I=${level}:TP=-2:LRA=7,afade=t=in:st=0:d=0.8,afade=t=out:st=${(TOTAL - 2.5).toFixed(3)}:d=2.5,aformat=channel_layouts=stereo[bed]`,
  );
  if (hasVoice) {
    // Duck the bed whenever the voice speaks; the voice is the sidechain and stays untouched.
    chains.push(
      "[1:a]aformat=channel_layouts=stereo,asplit[voice][key]",
      "[bed][key]sidechaincompress=threshold=0.02:ratio=10:attack=20:release=300:makeup=1[ducked]",
      "[voice][ducked]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.8:level=false[sound]",
    );
  } else chains.push("[bed]acopy[sound]");
} else if (hasVoice) {
  chains.push(
    `[1:a]afade=t=out:st=${(TOTAL - 0.8).toFixed(3)}:d=0.8,alimiter=limit=0.8:level=false[sound]`,
  );
}
if (voiceLabel === null && MUSIC === null) {
  ff([
    ...["-i", `${WORK}/picture.mp4`, "-c:v", "libx264", "-preset", "medium", "-crf", "19"],
    ...["-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", FINAL],
  ]);
} else {
  // The whole mix goes through a second loudness pass, so voice plus music lands on -16 LUFS.
  ff([
    ...["-i", `${WORK}/picture.mp4`, ...audioInputs],
    ...["-filter_complex", chains.join(";"), "-map", "[sound]", "-t", TOTAL.toFixed(3)],
    ...["-ar", "44100", "-c:a", "pcm_s16le", `${WORK}/sound.wav`],
  ]);
  const mixTarget = "I=-16:TP=-1.5:LRA=11";
  const pass = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      `${WORK}/sound.wav`,
      "-af",
      `loudnorm=${mixTarget}:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  const mix = JSON.parse(pass.stderr.slice(pass.stderr.lastIndexOf("{")));
  ff([
    ...["-i", `${WORK}/sound.wav`],
    ...[
      "-af",
      `loudnorm=${mixTarget}:measured_I=${mix.input_i}:measured_TP=${mix.input_tp}` +
        `:measured_LRA=${mix.input_lra}:measured_thresh=${mix.input_thresh}` +
        `:offset=${mix.target_offset}:linear=true,aresample=44100,alimiter=limit=0.8:level=false`,
    ],
    ...["-c:a", "pcm_s16le", `${WORK}/final-sound.wav`],
  ]);
  ff([
    ...["-i", `${WORK}/picture.mp4`, "-i", `${WORK}/final-sound.wav`, "-map", "0:v", "-map", "1:a"],
    ...["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p"],
    ...["-c:a", "aac", "-b:a", "256k", "-ar", "44100", "-t", TOTAL.toFixed(3)],
    ...["-movflags", "+faststart", FINAL],
  ]);
}

writeFileSync(
  `${WORK}/edl.json`,
  `${JSON.stringify(
    {
      total: Number(TOTAL.toFixed(2)),
      voice: estimated ? "none (silent cut, line durations estimated)" : "narration folder",
      music: MUSIC,
      lines: LINES.map((text, n) => ({
        line: n + 1,
        text,
        seconds: Number(lineSeconds[n].toFixed(2)),
        estimated,
        beat: `${beatStart[n].toFixed(2)}–${(beatStart[n] + beatLength[n]).toFixed(2)} s`,
        voiceStart: Number(voiceStarts[n].toFixed(2)),
      })),
      loudnorm: measured,
      edl,
    },
    null,
    2,
  )}\n`,
);
console.table(edl);
console.log(`${TOTAL.toFixed(2)} s → ${FINAL}`);
