// Edits the raw footage from tools/demo-capture.mjs into the demo video (step 2 of 2).
//   node tools/demo-edit.mjs <out-dir> <narration-dir> [--720]
// <out-dir> holds raw/ (raw.mp4, markers.json, slide-title.png, slide-end.png); <narration-dir>
// holds narration_01.mp3 … narration_07.mp3 (02 and 07 already trimmed). Writes
// <out-dir>/demo-v2.mp4 (1080p30, or 720p with --720; H.264 + AAC, +faststart) and
// <out-dir>/edit/edl.json (the edit decision list); intermediate clips stay in <out-dir>/edit.
// The timeline is driven by the narration: each scene lasts its clip plus a short breath, the voice
// starts a beat after the scene's picture, scenes dissolve into each other, the two diagram slides
// (docs/images) and the two text slides drift slowly, the voice is loudness-normalised (two-pass
// loudnorm), and picture and sound fade out at the end. No captions, no music. Needs ffmpeg.
// Not part of the site or CI.
import path from "node:path";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [OUT, NARRATION] = process.argv.slice(2);
if (OUT === undefined || NARRATION === undefined) {
  console.error("usage: node tools/demo-edit.mjs <out-dir> <narration-dir> [--720]");
  process.exit(1);
}
const RAW = `${OUT}/raw`;
const WORK = `${OUT}/edit`;
const FINAL = `${OUT}/demo-v2.mp4`;
const REPO = path.join(import.meta.dirname, "..");
const [W, H] = process.argv.includes("--720") ? [1280, 720] : [1920, 1080];
const FPS = 30;
const FADE = 0.5; // dissolve between scenes
const LEAD = 0.3; // the voice starts this long after a scene's picture is fully in
const BREATH = 0.4; // silence after each narration clip before the next scene starts to dissolve in
const TITLE_SECONDS = 2.5;
const END_SECONDS = 3;
const ROLES_SECONDS = 3.3; // roles slide inside scene 6, before the calaveritas

const { markers: m, gpt2Answer } = JSON.parse(readFileSync(`${RAW}/markers.json`, "utf8"));
mkdirSync(WORK, { recursive: true });
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
const probe = (file, entry) =>
  Number(
    execFileSync("ffprobe", [
      ...["-v", "error", "-show_entries", entry, "-of", "csv=p=0", file],
    ]).toString(),
  );
const narrationFile = (n) => `${NARRATION}/narration_0${n + 1}.mp3`;
const narration = Array.from({ length: 7 }, (_, n) => probe(narrationFile(n), "format=duration"));
const rawSeconds = probe(`${RAW}/raw.mp4`, "format=duration");
const slot = (n) => LEAD + narration[n] + BREATH;

// Where each scene's picture comes from. `slot` is its time between dissolve centres.
// Raw scenes pick a window of raw.mp4 from the beat markers; slide scenes are rendered below.
const scenes = [
  { name: "0 title", slide: "title", slot: TITLE_SECONDS },
  {
    name: "1 altar",
    voice: 0,
    slot: slot(0),
    from: () => m.altar_glide_start + 0.6,
  },
  { name: "2 dark frames", voice: 1, slot: slot(1), from: () => m.dark_glide_end - 1.3 },
  { name: "3 offering", voice: 2, slot: slot(2), from: (len) => m.offer_click + 1.1 - len },
  { name: "4 gpt-2", voice: 3, slot: slot(3), from: () => m.gpt2_first_token - 0.3 },
  { name: "5 gemma 1-3", voice: 4, slot: slot(4), from: () => m.gemma_glide_start + 1.3 },
  { name: "6a roles slide", voice: 5, slide: "roles", slot: ROLES_SECONDS },
  {
    name: "6b calaveritas",
    slot: slot(5) - ROLES_SECONDS,
    from: () => m.medium_jump + 0.3,
  },
  { name: "7 architecture slide", voice: 6, slide: "architecture", slot: slot(6) },
  { name: "8 end", slide: "end", slot: END_SECONDS },
];

// Slow drifts for the slides: zoom range, centre range (0..1 of the 16:9 composite), easing delay.
const slides = {
  title: {
    src: `${RAW}/slide-title.png`,
    z: [1, 1.06],
    c: [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
  },
  roles: {
    src: `${REPO}/docs/images/diagram-gemma-roles.png`,
    z: [1, 1.08],
    c: [
      [0.5, 0.5],
      [0.54, 0.5],
    ],
  },
  // Eases toward "Stored in this browser" and "What never exists" while the line is spoken.
  architecture: {
    src: `${REPO}/docs/images/diagram-architecture.png`,
    z: [1, 1.65],
    c: [
      [0.5, 0.5],
      [0.62, 0.74],
    ],
    delay: 0.5,
  },
  end: {
    src: `${RAW}/slide-end.png`,
    z: [1.05, 1],
    c: [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
  },
};

// Timeline: boundary[k] is the end of scene k's slot; scene k is on screen from boundary[k-1] -
// FADE/2 to boundary[k] + FADE/2 (the dissolves are centred on the boundaries).
let t = 0;
const timeline = scenes.map((scene, k) => {
  const start = t;
  t += scene.slot;
  const before = k > 0 ? FADE / 2 : 0;
  const after = k < scenes.length - 1 ? FADE / 2 : 0;
  return {
    ...scene,
    start,
    end: t,
    shownFrom: start - before,
    length: scene.slot + before + after,
  };
});
const TOTAL = t;
const frameCount = (seconds) => Math.round(seconds * FPS);

const encode = (file) => [
  ...["-an", "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p"],
  ...["-r", String(FPS), file],
];

const edl = [];
for (const [k, scene] of timeline.entries()) {
  const file = `${WORK}/scene_${k}.mp4`;
  const frames = frameCount(scene.length);
  scene.file = file;
  if (scene.slide === undefined) {
    const from = scene.from(scene.length);
    if (from < 0 || from + scene.length > rawSeconds) {
      throw new Error(
        `${scene.name}: raw window ${from}..${from + scene.length} is outside the footage`,
      );
    }
    ff([
      ...["-ss", from.toFixed(3), "-t", scene.length.toFixed(3), "-i", `${RAW}/raw.mp4`],
      ...["-vf", `fps=${FPS},scale=${W}:${H}:flags=lanczos,setsar=1`, "-frames:v", String(frames)],
      ...encode(file),
    ]);
    scene.source = `raw ${from.toFixed(2)}–${(from + scene.length).toFixed(2)} s`;
  } else {
    const slide = slides[scene.slide];
    // A 3840x2160 composite: the picture fitted, over a blurred, darkened copy of itself.
    const composite = `${WORK}/composite_${scene.slide}.png`;
    ff([
      ...["-i", slide.src],
      ...[
        "-filter_complex",
        "[0]split[a][b];" +
          "[a]scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,boxblur=60:6,eq=brightness=-0.12[bg];" +
          "[b]scale=3840:2160:force_original_aspect_ratio=decrease:flags=lanczos[fg];" +
          "[bg][fg]overlay=(W-w)/2:(H-h)/2",
      ],
      ...["-frames:v", "1", composite],
    ]);
    const delay = frameCount(slide.delay ?? 0);
    const progress = `clip((on-${delay})/${frames - 1 - delay},0,1)`;
    const eased = `(${progress}*${progress}*(3-2*${progress}))`;
    const mix = (pair) => `(${pair[0]}+(${pair[1]}-${pair[0]})*${eased})`;
    const zoom = mix(slide.z);
    const cx = mix(slide.c.map(([x]) => x));
    const cy = mix(slide.c.map(([, y]) => y));
    ff([
      ...["-i", composite],
      ...[
        "-vf",
        `zoompan=z='${zoom}':x='${cx}*iw-iw/(${zoom})/2':y='${cy}*ih-ih/(${zoom})/2':d=${frames}:s=${W}x${H}:fps=${FPS},setsar=1`,
        "-frames:v",
        String(frames),
      ],
      ...encode(file),
    ]);
    scene.source = `${scene.slide} slide, zoom ${slide.z[0]}→${slide.z[1]}`;
  }
  edl.push({
    scene: scene.name,
    source: scene.source,
    shown: `${scene.shownFrom.toFixed(2)}–${(scene.shownFrom + scene.length).toFixed(2)} s`,
    slot: `${scene.start.toFixed(2)}–${scene.end.toFixed(2)} s`,
    voice: scene.voice === undefined ? null : Number((scene.start + LEAD).toFixed(2)),
  });
}

// Picture: dissolve each scene into the next; fade in from black at the start, out at the end.
const inputs = timeline.flatMap((scene) => ["-i", scene.file]);
let graph = "";
let last = "0:v";
for (let k = 1; k < timeline.length; k++) {
  const offset = timeline[k].shownFrom;
  graph += `[${last}][${k}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[x${k}];`;
  last = `x${k}`;
}
graph += `[${last}]fade=t=in:st=0:d=0.6,fade=t=out:st=${(TOTAL - 0.9).toFixed(3)}:d=0.9,format=yuv420p[v]`;
ff([...inputs, "-filter_complex", graph, "-map", "[v]", ...encode(`${WORK}/picture.mp4`)]);

// Voice: each clip at its scene's start + LEAD, mixed, then loudness-normalised in two passes.
const voices = timeline.filter((scene) => scene.voice !== undefined);
const delayMs = (scene) => Math.round((scene.start + LEAD) * 1000);
ff([
  ...voices.flatMap((scene) => ["-i", narrationFile(scene.voice)]),
  ...[
    "-filter_complex",
    voices
      .map((scene, i) => `[${i}:a]aresample=44100,adelay=${delayMs(scene)}:all=1[a${i}]`)
      .join(";") +
      `;${voices.map((_, i) => `[a${i}]`).join("")}amix=inputs=${voices.length}:normalize=0:duration=longest,` +
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
const measured = JSON.parse(first.stderr.slice(first.stderr.lastIndexOf("{")));
const second =
  `loudnorm=${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}` +
  `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}` +
  `:offset=${measured.target_offset}:linear=true,aresample=44100,` +
  `afade=t=out:st=${(TOTAL - 1.2).toFixed(3)}:d=1.2`;
ff(["-i", `${WORK}/mix.wav`, "-af", second, "-c:a", "pcm_s16le", `${WORK}/voice.wav`]);

ff([
  ...["-i", `${WORK}/picture.mp4`, "-i", `${WORK}/voice.wav`],
  ...["-map", "0:v", "-map", "1:a"],
  ...["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p"],
  ...["-c:a", "aac", "-b:a", "192k"],
  ...["-t", TOTAL.toFixed(3), "-movflags", "+faststart", FINAL],
]);

writeFileSync(
  `${WORK}/edl.json`,
  `${JSON.stringify({ total: TOTAL, loudnorm: measured, gpt2Answer, edl }, null, 2)}\n`,
);
console.table(edl);
console.log(`${TOTAL.toFixed(2)} s, ${W}x${H} → ${FINAL}`);
