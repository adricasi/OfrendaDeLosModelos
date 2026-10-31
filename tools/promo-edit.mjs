// Marketing video for the DEV judges (about 45 s, 1080p30): fast cuts of the REAL footage, bold
// headlines in the site's fonts, slow push-ins, dissolves, optional voice-over.
//   node tools/promo-edit.mjs <out-dir> [--narration <dir>]
// <out-dir> holds raw/ from tools/demo-capture.mjs (raw.mp4 and markers.json: real footage of the
// production site, GPT-2 live on WebAssembly and the Gemma voices as recordings). Writes
// <out-dir>/promo.mp4 and <out-dir>/promo-edit/edl.json; clips and headline stills stay in
// <out-dir>/promo-edit. Without --narration the video is silent (no music). With --narration the
// folder must hold promo_01.mp3 … promo_07.mp3 (the seven lines below): the timeline then re-times
// to their real durations and the voice is mixed in (two-pass loudnorm, I=-16, TP=-1.5).
// Until the files exist each line is estimated at 2.6 words per second plus 0.4 s.
// Headlines are marketing titles, not captions; the footage under each claim is the footage the
// claim is about, and recorded voices keep their "Recorded voice" label on screen.
// Needs ffmpeg and the Chromium of tools/demo-capture.mjs (CHROMIUM_PATH overrides the path).
// Not part of the site or CI.
/* global document -- browser code inside page.evaluate */
import path from "node:path";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [OUT] = process.argv.slice(2);
const narrationArg = process.argv.indexOf("--narration");
const NARRATION_DIR = narrationArg > 0 ? process.argv[narrationArg + 1] : null;
if (
  OUT === undefined ||
  OUT.startsWith("--") ||
  (narrationArg > 0 && NARRATION_DIR === undefined)
) {
  console.error("usage: node tools/promo-edit.mjs <out-dir> [--narration <dir>]");
  process.exit(1);
}
const RAW = `${OUT}/raw`;
const WORK = `${OUT}/promo-edit`;
const FINAL = `${OUT}/promo.mp4`;
const REPO = path.join(import.meta.dirname, "..");
const [W, H, FPS] = [1920, 1080, 30];
const FADE = 0.35; // every dissolve, between shots and between beats
const LEAD = 0.25; // the voice starts this long after a beat's picture is in
const FIRST_LEAD = 0.6; // room for the fade in from black
const TAIL = 0.35; // breath after a line
const LAST_TAIL = 1.2; // room for the fade out to black

// The seven lines, as the founder will record them (promo_01.mp3 … promo_07.mp3).
const LINES = [
  "When a closed model is retired, it's gone. Nobody can ask it anything again.",
  "This is an altar for the models we can keep: open weights.",
  "Leave a question. GPT-2 answers live in your browser, and shows the ghost words it almost said, straight from its own probabilities.",
  "Gemma 1, 2 and 3 answer in their recorded voices.",
  "Then Gemma 4, the first Gemma under Apache 2.0, runs on your own device, tends the altar, and writes each model a calaverita.",
  "No server. No API key. Nothing you write leaves your machine.",
  "Ofrenda de los Modelos. Closed models fade. Open weights can always come back.",
];

const { markers: m } = JSON.parse(readFileSync(`${RAW}/markers.json`, "utf8"));
mkdirSync(WORK, { recursive: true });
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
const duration = (file) =>
  Number(
    execFileSync("ffprobe", [
      ...["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    ]).toString(),
  );
const rawSeconds = duration(`${RAW}/raw.mp4`);
const voiceFile = (n) => `${NARRATION_DIR}/promo_0${n + 1}.mp3`;
const estimated = NARRATION_DIR === null;
const lineSeconds = LINES.map((line, n) =>
  estimated ? line.split(/\s+/).length / 2.6 + 0.4 : duration(voiceFile(n)),
);

// Shots. `beat` is the line it plays under; `weight` shares the beat's time between its shots.
// Raw shots take a window of raw.mp4 from `from` (a marker plus an offset), stopping at `until`
// (the last second that still looks right; a longer shot holds its last frame while it keeps
// pushing in). Slide shots are diagrams or the end card. z and c are the push-in: zoom range and
// centre range (0..1 of the frame). `head` and `note` are the overlay texts.
const shots = [
  {
    beat: 0,
    name: "closed models: the dark frames",
    from: m.dark_glide_end - 0.3,
    until: m.dark_hold_end - 0.05,
    z: [1, 1.1],
    c: [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
    head: { big: "Closed models fade.", span: 2 },
  },
  {
    beat: 0,
    name: "closed models: across the empty frames",
    from: m.dark_hold_end - 3.3,
    until: m.dark_hold_end - 0.05,
    z: [1.28, 1.36],
    c: [
      [0.4, 0.6],
      [0.6, 0.6],
    ],
  },
  {
    beat: 1,
    name: "the altar, mid glide",
    from: m.altar_glide_start + 4.6,
    until: m.altar_glide_end,
    z: [1, 1.07],
    c: [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
    head: {
      big: "Ofrenda de los Modelos",
      small: "An artistic tribute to the memory of AI models, inspired by Día de Muertos",
    },
  },
  {
    beat: 2,
    name: "choose the question",
    weight: 2.2,
    from: m.question_cursor_start + 0.3,
    until: m.question_click + 1.2,
    z: [1, 1.09],
    c: [
      [0.5, 0.5],
      [0.46, 0.4],
    ],
  },
  {
    beat: 2,
    name: "offer it to the altar",
    weight: 2.2,
    from: m.offer_cursor_start + 0.2,
    until: m.offer_click + 0.9,
    z: [1, 1.09],
    c: [
      [0.5, 0.5],
      [0.34, 0.8],
    ],
  },
  {
    beat: 2,
    name: "GPT-2 streams live",
    weight: 2,
    from: m.gpt2_first_token - 0.2,
    until: m.ghost1_cursor_start,
    z: [1, 1.08],
    c: [
      [0.5, 0.5],
      [0.5, 0.42],
    ],
  },
  {
    beat: 2,
    name: "a ghost word, with its probabilities",
    weight: 3.8,
    from: m.ghost1_cursor_start + 0.4,
    until: m.ghost_end - 0.2,
    z: [1, 1.4],
    c: [
      [0.5, 0.5],
      [0.63, 0.56],
    ],
    head: { big: "Ghost words", small: "what GPT-2 almost said, from its own probabilities" },
  },
  {
    beat: 3,
    name: "Gemma 1 to 3, recorded voices",
    from: m.gemma_glide_start + 1.2,
    until: m.gemma3_end,
    z: [1, 1.06],
    c: [
      [0.5, 0.5],
      [0.5, 0.55],
    ],
    head: { big: "Recorded voices" },
  },
  {
    beat: 4,
    name: "roles diagram: Gemma 4 live in the browser",
    weight: 4.2,
    slide: "roles",
    z: [1, 1.55],
    c: [
      [0.5, 0.5],
      [0.75, 0.55],
    ],
    head: { big: "Gemma 4 tends the altar", small: "Apache 2.0 · on your device with WebGPU" },
  },
  {
    beat: 4,
    name: "the medium's calaveritas (a recording)",
    weight: 5.4,
    from: m.medium_jump + 0.45,
    until: m.medium_glide_end,
    z: [1, 1.05],
    c: [
      [0.5, 0.5],
      [0.5, 0.55],
    ],
    note: "Recorded voice, as the page labels it · a WebGPU browser runs Gemma 4 live",
  },
  {
    beat: 5,
    name: "architecture: what never exists",
    slide: "architecture",
    z: [1, 1.45],
    c: [
      [0.5, 0.5],
      [0.6, 0.62],
    ],
    head: { big: "No server · No API key · Nothing leaves your device", pos: "top", size: 70 },
  },
  {
    beat: 6,
    name: "end card",
    slide: "end",
    z: [1.04, 1],
    c: [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
  },
];

// Time. A beat lasts its line plus a lead and a tail; its shots share that time by weight, and
// every dissolve is centred on a boundary, so a shot is on screen FADE/2 longer on each side.
let t = 0;
const beatStart = [];
const beatLength = lineSeconds.map((seconds, n) => {
  const length =
    seconds + (n === 0 ? FIRST_LEAD : LEAD) + (n === LINES.length - 1 ? LAST_TAIL : TAIL);
  beatStart[n] = t;
  t += length;
  return length;
});
const TOTAL = t;
const weightOf = (shot) => shot.weight ?? 1;
const beatWeight = lineSeconds.map((_, n) =>
  shots.filter((s) => s.beat === n).reduce((sum, s) => sum + weightOf(s), 0),
);
let cursor = 0;
for (const [k, shot] of shots.entries()) {
  shot.start = cursor;
  shot.slot = (beatLength[shot.beat] * weightOf(shot)) / beatWeight[shot.beat];
  cursor += shot.slot;
  shot.end = cursor;
  shot.shownFrom = shot.start - (k > 0 ? FADE / 2 : 0);
  shot.length = shot.slot + (k > 0 ? FADE / 2 : 0) + (k < shots.length - 1 ? FADE / 2 : 0);
}
const frameCount = (seconds) => Math.round(seconds * FPS);
const encode = (file) => [
  ...["-an", "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-pix_fmt", "yuv420p"],
  ...["-r", String(FPS), file],
];

// Push-in as a zoompan expression: eased zoom and centre over the whole clip.
const pushIn = (shot, frames) => {
  const progress = `(on/${Math.max(1, frames - 1)})`;
  const eased = `(${progress}*${progress}*(3-2*${progress}))`;
  const mix = (pair) => `(${pair[0]}+(${pair[1]}-${pair[0]})*${eased})`;
  const zoom = mix(shot.z);
  const cx = mix(shot.c.map(([x]) => x));
  const cy = mix(shot.c.map(([, y]) => y));
  return `x='${cx}*iw-iw/(${zoom})/2':y='${cy}*ih-ih/(${zoom})/2':z='${zoom}'`;
};

// Headline stills in the site's fonts (embedded), transparent, 1920x1080.
const font = (file) => readFileSync(`${REPO}/public/fonts/${file}`).toString("base64");
const css = `
@font-face{font-family:Gloock;src:url(data:font/woff2;base64,${font("Gloock-latin.woff2")}) format("woff2")}
@font-face{font-family:"Bricolage Grotesque";font-weight:400 700;
  src:url(data:font/woff2;base64,${font("BricolageGrotesque-latin.woff2")}) format("woff2")}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}
.scrim{position:absolute;left:0;right:0;height:46%}
.scrim.bottom{bottom:0;background:linear-gradient(to top,rgb(8 4 10/.84),rgb(8 4 10/.5) 55%,transparent)}
.scrim.top{top:0;background:linear-gradient(to bottom,rgb(8 4 10/.84),rgb(8 4 10/.5) 55%,transparent)}
.block{position:absolute;left:0;right:0;padding:0 110px;text-align:center}
.block.bottom{bottom:96px}.block.top{top:70px}
.big{font-family:Gloock,Georgia,serif;color:#ffc76b;line-height:1.08;margin:0;
  text-shadow:0 4px 28px rgb(0 0 0/.6)}
.small{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:500;font-size:34px;
  color:#fff4e0;margin:18px auto 0;max-width:1400px;text-shadow:0 2px 14px rgb(0 0 0/.7)}
.hide{visibility:hidden}`;
const overlayHtml = ({ big, small, pos = "bottom", size = 104 }, layer) => `<!doctype html>
<meta charset="utf-8"><style>${css}</style>
${layer === "big" || big === undefined ? `<div class="scrim ${pos}"></div>` : ""}
<div class="block ${pos}">
  ${big === undefined ? "" : `<h1 class="big ${layer === "big" ? "" : "hide"}" style="font-size:${size}px"></h1>`}
  ${small === undefined ? "" : `<p class="small ${layer === "small" || big === undefined ? "" : "hide"}"></p>`}
</div>`;
const endHtml = `<!doctype html><meta charset="utf-8"><style>${css}
html,body{background:radial-gradient(circle at 50% 45%,#2b1630,#0f0810 70%)}
.card{position:absolute;inset:0;display:grid;place-content:center;gap:14px;text-align:center}
.big{font-size:92px}.line2{margin-top:-4px}
.url{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:500;font-size:36px;color:#fff4e0;margin-top:44px}
.small{margin-top:10px;font-size:26px;opacity:.7}</style>
<div class="card"><h1 class="big">Closed models fade.</h1><h1 class="big line2">Open weights can always come back.</h1>
<div class="url">adricasi.github.io/OfrendaDeLosModelos</div>
<div class="small" style="font-family:'Bricolage Grotesque';color:#fff4e0">Hacktoberfest Open-Source AI Challenge · Ghost in the Machine</div></div>`;

async function renderStills() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const png = async (html, file, texts, omitBackground) => {
    await page.setContent(html);
    await page.evaluate(
      ([t]) => {
        for (const [selector, text] of Object.entries(t)) {
          const el = document.querySelector(selector);
          if (el) el.textContent = text;
        }
      },
      [texts],
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file, omitBackground });
  };
  const overlays = [];
  for (const [k, shot] of shots.entries()) {
    const item = { ...shot.head, small: shot.head?.small ?? shot.note };
    if (shot.head === undefined && shot.note === undefined) continue;
    const texts = { ".big": item.big ?? "", ".small": item.small ?? "" };
    const files = {};
    if (item.big !== undefined) {
      files.big = `${WORK}/overlay_${k}_big.png`;
      await png(overlayHtml(item, "big"), files.big, texts, true);
    }
    if (item.small !== undefined) {
      files.small = `${WORK}/overlay_${k}_small.png`;
      await png(overlayHtml(item, "small"), files.small, texts, true);
    }
    overlays.push({ shot: k, ...files, withBig: item.big !== undefined });
  }
  await browser.close();
  const hi = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  });
  const endPage = await hi.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await endPage.setContent(endHtml);
  await endPage.evaluate(() => document.fonts.ready);
  await endPage.screenshot({ path: `${WORK}/end-card.png` });
  await hi.close();
  return overlays;
}
const overlays = await renderStills();
const slideSource = {
  roles: `${REPO}/docs/images/diagram-gemma-roles.png`,
  architecture: `${REPO}/docs/images/diagram-architecture.png`,
  end: `${WORK}/end-card.png`,
};

// Shots to clips.
const edl = [];
for (const [k, shot] of shots.entries()) {
  const file = `${WORK}/shot_${k}.mp4`;
  const frames = frameCount(shot.length);
  shot.file = file;
  if (shot.slide === undefined) {
    const available = Math.min(shot.until, rawSeconds) - shot.from;
    const read = Math.min(shot.length, available);
    const hold = shot.length - read;
    if (shot.from < 0 || available <= 0.5) {
      throw new Error(`${shot.name}: no footage at ${shot.from}`);
    }
    ff([
      ...["-ss", shot.from.toFixed(3), "-t", read.toFixed(3), "-i", `${RAW}/raw.mp4`],
      ...[
        "-vf",
        `fps=${FPS},scale=${W * 2}:${H * 2}:flags=bicubic,` +
          (hold > 0 ? `tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)},` : "") +
          `zoompan=${pushIn(shot, frames)}:d=1:s=${W}x${H}:fps=${FPS},setsar=1`,
        ...["-frames:v", String(frames)],
      ],
      ...encode(file),
    ]);
    shot.source = `raw ${shot.from.toFixed(2)}–${(shot.from + read).toFixed(2)} s${hold > 0 ? `, last frame held ${hold.toFixed(1)} s` : ""}`;
  } else {
    const composite = `${WORK}/composite_${shot.slide}.png`;
    ff([
      ...["-i", slideSource[shot.slide]],
      ...[
        "-filter_complex",
        "[0]split[a][b];" +
          "[a]scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,boxblur=60:6,eq=brightness=-0.12[bg];" +
          "[b]scale=3840:2160:force_original_aspect_ratio=decrease:flags=lanczos[fg];" +
          "[bg][fg]overlay=(W-w)/2:(H-h)/2",
      ],
      ...["-frames:v", "1", composite],
    ]);
    ff([
      ...["-i", composite],
      ...[
        "-vf",
        `zoompan=${pushIn(shot, frames)}:d=${frames}:s=${W}x${H}:fps=${FPS},setsar=1`,
        ...["-frames:v", String(frames)],
      ],
      ...encode(file),
    ]);
    shot.source = `${shot.slide} slide`;
  }
  edl.push({
    shot: shot.name,
    beat: shot.beat + 1,
    source: shot.source,
    zoom: `${shot.z[0]}→${shot.z[1]}`,
    shown: `${shot.shownFrom.toFixed(2)}–${(shot.shownFrom + shot.length).toFixed(2)} s`,
    overlay: shot.head?.big ?? shot.head?.small ?? shot.note ?? null,
  });
}

// Picture: dissolves, headline overlays (fade in with a short rise, fade out), fade in and out.
const inputs = shots.flatMap((shot) => ["-i", shot.file]);
let graph = "";
let last = "0:v";
for (let k = 1; k < shots.length; k++) {
  graph += `[${last}][${k}:v]xfade=transition=fade:duration=${FADE}:offset=${shots[k].shownFrom.toFixed(3)}[x${k}];`;
  last = `x${k}`;
}
let inputIndex = shots.length;
const stillInputs = [];
for (const overlay of overlays) {
  const shot = shots[overlay.shot];
  const from = shot.start + FADE / 2 + 0.25;
  const to = shots[overlay.shot + (shot.head?.span ?? 1) - 1].end - 0.05;
  for (const [layer, delay] of [
    ["big", 0],
    ["small", 0.3],
  ]) {
    const file = overlay[layer];
    if (file === undefined) continue;
    const s = from + (layer === "small" && overlay.withBig ? delay : 0);
    stillInputs.push(
      ...["-framerate", String(FPS), "-loop", "1", "-t", TOTAL.toFixed(2), "-i", file],
    );
    graph +=
      `[${inputIndex}:v]format=rgba,fade=t=in:st=${s.toFixed(3)}:d=0.45:alpha=1,` +
      `fade=t=out:st=${(to - 0.3).toFixed(3)}:d=0.3:alpha=1[o${inputIndex}];` +
      `[${last}][o${inputIndex}]overlay=x=0:y='28*pow(1-clip((t-${s.toFixed(3)})/0.6,0,1),3)':eof_action=pass[y${inputIndex}];`;
    last = `y${inputIndex}`;
    inputIndex += 1;
  }
}
graph += `[${last}]fade=t=in:st=0:d=0.5,fade=t=out:st=${(TOTAL - 1).toFixed(3)}:d=1,format=yuv420p[v]`;
ff([
  ...inputs,
  ...stillInputs,
  ...["-filter_complex", graph, "-map", "[v]"],
  ...["-t", TOTAL.toFixed(3)],
  ...encode(`${WORK}/picture.mp4`),
]);

// Sound: silent unless the narration folder is given.
const voiceStarts = LINES.map((_, n) => beatStart[n] + (n === 0 ? FIRST_LEAD : LEAD));
let measured = null;
if (NARRATION_DIR === null) {
  ff([
    ...["-i", `${WORK}/picture.mp4`, "-c:v", "libx264", "-preset", "medium", "-crf", "19"],
    ...["-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", FINAL],
  ]);
} else {
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
  const second =
    `loudnorm=${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}` +
    `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}` +
    `:offset=${measured.target_offset}:linear=true,aresample=44100,` +
    `afade=t=out:st=${(TOTAL - 1).toFixed(3)}:d=1`;
  ff(["-i", `${WORK}/mix.wav`, "-af", second, "-c:a", "pcm_s16le", `${WORK}/voice.wav`]);
  ff([
    ...["-i", `${WORK}/picture.mp4`, "-i", `${WORK}/voice.wav`, "-map", "0:v", "-map", "1:a"],
    ...["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p"],
    ...["-c:a", "aac", "-b:a", "192k", "-t", TOTAL.toFixed(3), "-movflags", "+faststart", FINAL],
  ]);
}

writeFileSync(
  `${WORK}/edl.json`,
  `${JSON.stringify(
    {
      total: Number(TOTAL.toFixed(2)),
      voice: estimated ? "none (silent cut, line durations estimated)" : "narration folder",
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
