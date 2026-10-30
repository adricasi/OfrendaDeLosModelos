/* global document, navigator, performance, fetch, URL, console, setTimeout, PerformanceObserver, URLSearchParams */
// T-001 spike (throwaway). transformers.js API verified against the 4.3.1 package:
//  - package.json "exports": browsers get ./dist/transformers.web.js (ESM, unminified).
//  - dist/transformers.web.js export list: env, LogLevel, AutoTokenizer, AutoProcessor,
//    AutoModelForCausalLM, TextStreamer, LogitsProcessor, ModelRegistry, Gemma4ForCausalLM.
//  - src/generation/logits_process.js: LogitsProcessor extends Callable; _call(input_ids, logits)
//    with logits a [batch, vocab] Tensor; `generate({ logits_processor: [...] })` is extended into
//    the processor list (src/models/modeling_utils.js, _get_logits_processor + generate loop).
//    The processor runs BEFORE sampling, so it sees the raw next-token logits at each step.
//  - src/generation/streamers.js: TextStreamer({ skip_prompt, callback_function,
//    token_callback_function }); token_callback_function gets bigint[] per generated token.
//  - src/utils/core.js: progress_callback events 'initiate' | 'download' | 'progress'
//    {file, loaded, total} | 'done' | 'progress_total' {loaded, total, files}.
//  - src/utils/dtypes.js: dtype suffixes and per-session dtype objects (selectDtype).
//  - src/models/session_config.js + registry.js: gemma4 loaded via AutoModelForCausalLM runs
//    text-only with sessions embed_tokens and decoder_model_merged (per-session dtype keys).
//  - src/models/gemma4/modeling_gemma4.js: Gemma4ForConditionalGeneration (fallback loader); it is
//    in the dist export list. Its type ImageAudioTextToText (session_config.js) also loads
//    vision_encoder and audio_encoder sessions unless text-only, so the fallback dtype map adds
//    those keys; generation uses the same decoder_prepare_inputs_for_generation path with text-only
//    processor inputs (src/models/modeling_utils.js).
//  - src/models/gemma4/processing_gemma4.js: Processor.apply_chat_template(messages, options),
//    and processor(text, images, audio, options) returns tokenizer inputs.

const TJS_VERSION = "4.3.1";
const TJS_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TJS_VERSION}/dist/transformers.web.js`;
const HF = "https://huggingface.co";
// Mirrors DEFAULT_DTYPE_SUFFIX_MAPPING in src/utils/dtypes.js
const SUFFIX_TO_DTYPE = {
  "": "fp32",
  _fp16: "fp16",
  _int8: "int8",
  _uint8: "uint8",
  _quantized: "q8",
  _q4: "q4",
  _q2: "q2",
  _q1: "q1",
  _q4f16: "q4f16",
  _q2f16: "q2f16",
  _q1f16: "q1f16",
  _bnb4: "bnb4",
};

const $ = (id) => document.getElementById(id);
const nowMs = () => performance.now();
const report = {
  generatedAt: null,
  library: { version: TJS_VERSION, url: TJS_URL },
  environment: null,
  models: { gpt2: null, gemma4: null },
  gpt2: null,
  gemma4: null,
  hosts: null,
  fetches: [],
  errors: [],
};
const state = { tjs: null, gpt2: null, gemma: null, found: { gpt2: [], gemma: [] } };

function fmtBytes(n) {
  if (!Number.isFinite(n)) return "?";
  if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(1)} kB`;
}

function setText(id, text) {
  $(id).textContent = text;
}

function recordError(step, err) {
  const e = err instanceof Error ? err : new Error(String(err));
  report.errors.push({ step, message: e.message, stack: e.stack ?? null });
  setText(
    "errors-out",
    report.errors.map((x) => `[${x.step}] ${x.message}\n${x.stack ?? ""}`).join("\n\n"),
  );
  refreshReport();
}

async function guarded(step, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(step, err);
    recordError(step, err);
    return undefined;
  }
}

// ---- network observation ------------------------------------------------------------------
performance.setResourceTimingBufferSize?.(2000);
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input.url ?? String(input));
  const entry = { url, finalUrl: null, status: null };
  report.fetches.push(entry);
  try {
    const res = await originalFetch(input, init);
    entry.finalUrl = res.url;
    entry.status = res.status;
    return res;
  } catch (err) {
    entry.status = `error: ${err instanceof Error ? err.message : String(err)}`;
    throw err;
  }
};

function hostOf(url) {
  try {
    return new URL(url, globalThis.location.href).hostname;
  } catch {
    return null;
  }
}

function computeHosts() {
  const hosts = new Map();
  const add = (host, source) => {
    if (!host) return;
    const set = hosts.get(host) ?? new Set();
    set.add(source);
    hosts.set(host, set);
  };
  for (const r of performance.getEntriesByType("resource")) add(hostOf(r.name), "resource-timing");
  for (const f of report.fetches) {
    add(hostOf(f.url), "fetch-request");
    if (f.finalUrl) add(hostOf(f.finalUrl), "fetch-final-url-after-redirect");
  }
  report.hosts = Object.fromEntries([...hosts].map(([h, s]) => [h, [...s].sort()]));
  setText(
    "hosts-out",
    Object.entries(report.hosts)
      .map(([h, s]) => `${h}  (${s.join(", ")})`)
      .join("\n") || "(none yet)",
  );
  refreshReport();
}

function refreshReport() {
  report.generatedAt = new Date().toISOString();
  setText("report-out", JSON.stringify(report, null, 2));
}

// ---- section 0: library ---------------------------------------------------------------------
async function loadLibrary() {
  if (state.tjs) return state.tjs;
  setText("lib-status", `Importing ${TJS_URL} ...`);
  const t0 = nowMs();
  state.tjs = await import(TJS_URL);
  report.library.importMs = Math.round(nowMs() - t0);
  const { env, LogLevel } = state.tjs;
  env.logLevel = LogLevel.WARNING;
  setText("lib-status", `Loaded in ${report.library.importMs} ms.`);
  computeHosts();
  return state.tjs;
}

// ---- section 1: environment -----------------------------------------------------------------
async function checkEnvironment() {
  const env = {
    userAgent: navigator.userAgent,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    webgpu: Boolean(navigator.gpu),
    adapter: null,
    shaderF16: null,
    limits: null,
  };
  if (navigator.gpu) {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter) {
      const info = adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? null;
      env.adapter = info
        ? {
            vendor: info.vendor,
            architecture: info.architecture,
            device: info.device,
            description: info.description,
          }
        : "adapter obtained, no info exposed";
      env.shaderF16 = adapter.features.has("shader-f16");
      env.limits = {
        maxBufferSize: adapter.limits.maxBufferSize,
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      };
    } else {
      env.adapter = "requestAdapter() returned null";
    }
  }
  report.environment = env;
  state.shaderF16 = env.shaderF16 === true;
  setText("env-out", JSON.stringify(env, null, 2));
  refreshReport();
}

// ---- section 2: find models -----------------------------------------------------------------
async function hfJson(path) {
  const res = await fetch(`${HF}${path}`);
  if (!res.ok) throw new Error(`HF API ${path} -> HTTP ${res.status}`);
  return res.json();
}

async function search(author, query) {
  const params = new URLSearchParams({ search: query, author, limit: "20" });
  const list = await hfJson(`/api/models?${params.toString()}`);
  return list.map((m) => m.id ?? m.modelId).filter(Boolean);
}

async function searchAll(queries) {
  const ids = new Set();
  for (const [author, q] of queries) {
    const found = await guarded(`search ${author}/${q}`, () => search(author, q));
    for (const id of found ?? []) ids.add(id);
  }
  return [...ids];
}

function scoreGpt2(id) {
  const name = id.split("/")[1]?.toLowerCase() ?? "";
  let s = 0;
  if (name === "gpt2") s += 100;
  else if (name.startsWith("gpt2")) s += 40;
  if (/medium|large|xl|distil|small|lm/.test(name)) s -= 50;
  if (id.startsWith("Xenova/")) s += 10;
  if (name.includes("onnx")) s += 5;
  return s;
}

function scoreGemma(id) {
  const name = id.split("/")[1]?.toLowerCase() ?? "";
  let s = 0;
  if (/gemma-?4/.test(name)) s += 50;
  if (name.includes("e2b")) s += 50;
  if (/-it\b|-it-/.test(name)) s += 20;
  if (name.includes("onnx")) s += 5;
  if (/e4b|12b|27b|26b|31b/.test(name)) s -= 100;
  return s;
}

function fillSelect(select, ids, scorer, label) {
  select.replaceChildren();
  const sorted = [...ids].sort((a, b) => scorer(b) - scorer(a));
  sorted.forEach((id, i) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = i === 0 ? `${id}  [candidate: ${label}, verify]` : id;
    select.append(opt);
  });
  if (sorted.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(nothing found)";
    select.append(opt);
  }
}

async function findModels() {
  setText("find-out", "Searching ...");
  if (!report.environment) await guarded("environment", checkEnvironment);
  const [gpt2, gemma] = await Promise.all([
    searchAll([
      ["Xenova", "gpt2"],
      ["onnx-community", "gpt2"],
    ]),
    searchAll([
      ["onnx-community", "gemma-4"],
      ["onnx-community", "gemma4"],
      ["onnx-community", "e2b"],
    ]),
  ]);
  state.found.gpt2 = gpt2;
  state.found.gemma = gemma;
  fillSelect($("gpt2-id"), gpt2, scoreGpt2, "best name match");
  fillSelect($("gemma-id"), gemma, scoreGemma, "Gemma 4 E2B match");
  setText(
    "find-out",
    `GPT-2 candidates (${gpt2.length}):\n${gpt2.join("\n")}\n\nGemma 4 candidates (${gemma.length}):\n${gemma.join("\n")}`,
  );
  report.models.search = { gpt2, gemma };
  refreshReport();
  await inspectPicked();
}

function licenseOf(info) {
  const fromCard = info.cardData?.license;
  if (fromCard) return String(fromCard);
  const tag = (info.tags ?? []).find((t) => t.startsWith("license:"));
  return tag ? tag.slice("license:".length) : null;
}

function sizeOfFiles(siblings, prefix) {
  return siblings
    .filter((s) => s.rfilename.startsWith(prefix))
    .reduce((sum, s) => sum + (s.size ?? 0), 0);
}

/** Map component -> dtype -> total bytes, from files `onnx/<component><suffix>.onnx[_data*]`. */
function onnxVariants(siblings, components) {
  const out = {};
  for (const comp of components) out[comp] = {};
  for (const s of siblings) {
    for (const comp of components) {
      const m = new RegExp(`^onnx/${comp}(_[a-z0-9]+)?\\.onnx$`).exec(s.rfilename);
      if (!m) continue;
      const suffix = m[1] ?? "";
      const dtype = SUFFIX_TO_DTYPE[suffix];
      if (dtype) out[comp][dtype] = sizeOfFiles(siblings, `onnx/${comp}${suffix}.onnx`);
    }
  }
  return out;
}

async function inspectModel(id) {
  const info = await hfJson(`/api/models/${id}?blobs=true`);
  const siblings = (info.siblings ?? []).map((s) => ({
    rfilename: s.rfilename,
    size: s.size ?? null,
  }));
  return {
    id,
    sha: info.sha,
    license: licenseOf(info),
    gated: info.gated ?? false,
    lastModified: info.lastModified ?? null,
    siblings,
  };
}

function fillDtypeSelect(select, variants, defaultDtype) {
  select.replaceChildren();
  const entries = Object.entries(variants).sort((a, b) => a[1] - b[1]);
  for (const [dtype, bytes] of entries) {
    const opt = document.createElement("option");
    opt.value = dtype;
    opt.textContent = `${dtype} (${fmtBytes(bytes)})`;
    if (dtype === defaultDtype) opt.selected = true;
    select.append(opt);
  }
  if (entries.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(no ONNX files found)";
    select.append(opt);
  }
}

function smallestFourBit(variants) {
  const four = Object.entries(variants)
    .filter(([d]) => /^(q4|q4f16|bnb4)$/.test(d))
    .filter(([d]) => state.shaderF16 || !d.endsWith("f16"))
    .sort((a, b) => a[1] - b[1]);
  if (four[0]) return four[0][0];
  const any = Object.entries(variants).sort((a, b) => a[1] - b[1]);
  return any[0]?.[0] ?? null;
}

function syncDtypeText() {
  const decoder = $("gemma-dtype-decoder").value;
  const embed = $("gemma-dtype-embed").value;
  $("gemma-dtype-json").value = JSON.stringify(
    { embed_tokens: embed, decoder_model_merged: decoder },
    null,
    2,
  );
}

function readDtypeMap() {
  const map = JSON.parse($("gemma-dtype-json").value);
  if (!map || typeof map !== "object" || Array.isArray(map))
    throw new Error("dtype map must be a JSON object");
  for (const [k, v] of Object.entries(map)) {
    if (typeof v !== "string" || !v) throw new Error(`dtype for ${k} must be a non-empty string`);
  }
  return map;
}

async function inspectPicked() {
  const gpt2Id = $("gpt2-id").value;
  const gemmaId = $("gemma-id").value;
  const lines = [];
  if (gpt2Id) {
    const d = await guarded("inspect gpt2", () => inspectModel(gpt2Id));
    if (d) {
      state.gpt2Info = d;
      const v = onnxVariants(d.siblings, ["model"]).model;
      state.gpt2Variants = v;
      fillDtypeSelect($("gpt2-dtype"), v, v.fp32 !== undefined ? "fp32" : null);
      report.models.gpt2 = {
        id: d.id,
        sha: d.sha,
        license: d.license,
        dtypeBytes: v,
        files: d.siblings,
      };
      lines.push(
        `GPT-2 ${d.id}\n  sha ${d.sha}\n  license ${d.license}\n  dtypes ${JSON.stringify(v)}`,
      );
    }
  }
  if (gemmaId) {
    const d = await guarded("inspect gemma", () => inspectModel(gemmaId));
    if (d) {
      state.gemmaInfo = d;
      const v = onnxVariants(d.siblings, [
        "decoder_model_merged",
        "embed_tokens",
        "vision_encoder",
        "audio_encoder",
      ]);
      state.gemmaVariants = v;
      fillDtypeSelect(
        $("gemma-dtype-decoder"),
        v.decoder_model_merged,
        smallestFourBit(v.decoder_model_merged),
      );
      fillDtypeSelect($("gemma-dtype-embed"), v.embed_tokens, smallestFourBit(v.embed_tokens));
      syncDtypeText();
      report.models.gemma4 = {
        id: d.id,
        sha: d.sha,
        license: d.license,
        gated: d.gated,
        dtypeBytes: v,
        files: d.siblings,
      };
      setText(
        "gemma-files",
        `sha ${d.sha}; license ${d.license}; f16 shaders on this GPU: ${state.shaderF16}\n` +
          d.siblings
            .filter((s) => s.rfilename.startsWith("onnx/"))
            .map((s) => `${s.rfilename} ${fmtBytes(s.size ?? NaN)}`)
            .join("\n"),
      );
      lines.push(`Gemma ${d.id}\n  sha ${d.sha}\n  license ${d.license}\n  gated ${d.gated}`);
    }
  }
  const prev = $("find-out").textContent;
  setText("find-out", `${prev}\n\n--- inspected ---\n${lines.join("\n")}`);
  refreshReport();
}

// ---- shared load/generate helpers -----------------------------------------------------------
function makeProgress(barId, textId) {
  const files = new Map();
  const cb = (p) => {
    if (p.status === "progress" && p.file) {
      files.set(p.file, { loaded: p.loaded, total: p.total });
    }
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    if (total > 0) {
      $(barId).value = (loaded / total) * 100;
      setText(textId, `${fmtBytes(loaded)} / ${fmtBytes(total)} (${files.size} files)`);
    }
  };
  return { cb, files };
}

function summarizeFiles(files) {
  return Object.fromEntries([...files].map(([f, v]) => [f, v.total]));
}

function totalOf(files) {
  let t = 0;
  for (const v of files.values()) t += v.total;
  return t;
}

function timingStats(tStart, tokenTimes, tEnd) {
  const n = tokenTimes.length;
  const first = tokenTimes[0];
  const last = tokenTimes[n - 1];
  return {
    newTokens: n,
    timeToFirstTokenMs: n ? Math.round(first - tStart) : null,
    tokensPerSecondDecode: n > 1 ? +(((n - 1) / (last - first)) * 1000).toFixed(2) : null,
    tokensPerSecondOverall: n ? +((n / (tEnd - tStart)) * 1000).toFixed(2) : null,
    totalMs: Math.round(tEnd - tStart),
  };
}

function showTimings(id, loadMs, bytes, stats) {
  setText(
    id,
    `load ${Math.round(loadMs)} ms; downloaded ${fmtBytes(bytes)} (0 if cached); ` +
      `first token ${stats.timeToFirstTokenMs} ms; decode ${stats.tokensPerSecondDecode} tok/s; ` +
      `overall ${stats.tokensPerSecondOverall} tok/s; total ${stats.totalMs} ms; ${stats.newTokens} tokens`,
  );
}

function requireWebGpu() {
  if (!navigator.gpu) throw new Error("WebGPU is not available in this browser");
}

// ---- section 3: GPT-2 -----------------------------------------------------------------------
function makeTopKRecorder(tjs, tokenizer, k, sink) {
  const { LogitsProcessor, softmax } = tjs;
  class TopKRecorder extends LogitsProcessor {
    _call(inputIds, logits) {
      // logits: [batch, vocab] Tensor; batch is 1 here. softmax over the raw logits.
      const row = logits.data;
      const probs = softmax(Array.from(row));
      const idx = Array.from({ length: probs.length }, (_, i) => i);
      idx.sort((a, b) => probs[b] - probs[a]);
      sink.push(
        idx.slice(0, k).map((i) => ({
          id: i,
          token: tokenizer.decode([i], { skip_special_tokens: false }),
          p: +probs[i].toFixed(5),
        })),
      );
      return logits;
    }
  }
  return new TopKRecorder();
}

function renderTopK(steps, chosen, tokenizer) {
  const table = document.createElement("table");
  const head = table.insertRow();
  for (const h of ["step", "chosen", "top-1", "top-2", "top-3"]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  steps.forEach((alts, i) => {
    const row = table.insertRow();
    row.insertCell().textContent = String(i);
    row.insertCell().textContent = JSON.stringify(
      tokenizer.decode([chosen[i]], { skip_special_tokens: false }),
    );
    for (let j = 0; j < 3; j++) {
      const a = alts[j];
      row.insertCell().textContent = a
        ? `${JSON.stringify(a.token)} ${(a.p * 100).toFixed(1)}%`
        : "";
    }
  });
  $("gpt2-table").replaceChildren(table);
}

async function runGpt2() {
  requireWebGpu();
  const tjs = await loadLibrary();
  if (!state.gpt2Info) await inspectPicked();
  const info = state.gpt2Info;
  if (!info) throw new Error("No GPT-2 model inspected; run section 2 first");
  const { AutoTokenizer, AutoModelForCausalLM, TextStreamer } = tjs;

  const picked = $("gpt2-dtype").value;
  const available = Object.keys(state.gpt2Variants ?? {});
  const order = [picked, "fp32", "fp16", "q8", "q4"].filter(
    (d, i, a) => d && a.indexOf(d) === i && available.includes(d),
  );
  const tried = [];
  const progress = makeProgress("gpt2-progress", "gpt2-progress-text");
  const tLoad = nowMs();
  const tokenizer = await AutoTokenizer.from_pretrained(info.id, {
    revision: info.sha,
    progress_callback: progress.cb,
  });
  let model = null;
  let usedDtype = null;
  for (const dtype of order) {
    try {
      model = await AutoModelForCausalLM.from_pretrained(info.id, {
        revision: info.sha,
        device: "webgpu",
        dtype,
        progress_callback: progress.cb,
      });
      usedDtype = dtype;
      break;
    } catch (err) {
      tried.push({ dtype, error: err instanceof Error ? err.message : String(err) });
      recordError(`gpt2 load dtype ${dtype}`, err);
    }
  }
  if (!model) throw new Error(`GPT-2 failed to load with all dtypes: ${JSON.stringify(tried)}`);
  const loadMs = nowMs() - tLoad;
  setText("gpt2-stream", "");

  const prompt = $("gpt2-prompt").value;
  const inputs = tokenizer(prompt);
  const promptLength = inputs.input_ids.dims.at(-1);
  const steps = [];
  const recorder = makeTopKRecorder(tjs, tokenizer, 3, steps);
  const tokenTimes = [];
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    callback_function: (text) => {
      $("gpt2-stream").textContent += text;
    },
    token_callback_function: () => tokenTimes.push(nowMs()),
  });
  const tStart = nowMs();
  const output = await model.generate({
    ...inputs,
    max_new_tokens: 30,
    do_sample: false,
    streamer,
    logits_processor: [recorder],
  });
  const tEnd = nowMs();
  const all = output.tolist()[0].map(Number);
  const chosen = all.slice(promptLength);
  const text = tokenizer.decode(chosen, { skip_special_tokens: true });
  $("gpt2-stream").textContent = `${prompt}${text}`;
  renderTopK(steps, chosen, tokenizer);

  const stats = timingStats(tStart, tokenTimes, tEnd);
  const bytes = totalOf(progress.files);
  showTimings("gpt2-timings", loadMs, bytes, stats);
  report.gpt2 = {
    id: info.id,
    sha: info.sha,
    license: info.license,
    device: "webgpu",
    dtypeUsed: usedDtype,
    dtypeAttemptsFailed: tried,
    loadMs: Math.round(loadMs),
    downloadBytes: bytes,
    fileSizes: summarizeFiles(progress.files),
    timings: stats,
    prompt,
    generated: text,
    topKSample: steps.map((alts, i) => ({
      step: i,
      chosenId: chosen[i],
      chosen: tokenizer.decode([chosen[i]], { skip_special_tokens: false }),
      top3: alts,
    })),
  };
  state.gpt2 = { tokenizer, model };
  computeHosts();
}

// ---- section 4: Gemma 4 ---------------------------------------------------------------------
async function runGemma() {
  requireWebGpu();
  const tjs = await loadLibrary();
  if (!state.gemmaInfo) await inspectPicked();
  const info = state.gemmaInfo;
  if (!info) throw new Error("No Gemma 4 model inspected; run section 2 first");
  const { AutoProcessor, AutoModelForCausalLM, Gemma4ForConditionalGeneration, TextStreamer } = tjs;

  // The free-text map is the source of truth (the dropdowns only pre-fill it).
  const dtype = readDtypeMap();

  const progress = makeProgress("gemma-progress", "gemma-progress-text");
  const tLoad = nowMs();
  const processor = await AutoProcessor.from_pretrained(info.id, {
    revision: info.sha,
    progress_callback: progress.cb,
  });
  let model = null;
  let loader = null;
  let usedDtype = dtype;
  const loaderErrors = [];
  try {
    model = await AutoModelForCausalLM.from_pretrained(info.id, {
      revision: info.sha,
      device: "webgpu",
      dtype,
      progress_callback: progress.cb,
    });
    loader = "AutoModelForCausalLM (text-only sessions)";
  } catch (err) {
    loaderErrors.push({
      loader: "AutoModelForCausalLM",
      error: err instanceof Error ? err.message : String(err),
    });
    recordError("gemma4 load AutoModelForCausalLM", err);
    if (!Gemma4ForConditionalGeneration) throw err;
    // Fallback: also loads vision/audio encoders, so pin their dtype to the smallest available.
    usedDtype = { ...dtype };
    for (const comp of ["vision_encoder", "audio_encoder"]) {
      const options = Object.entries(state.gemmaVariants?.[comp] ?? {}).sort((x, y) => x[1] - y[1]);
      if (!(comp in usedDtype) && options[0]) usedDtype[comp] = options[0][0];
    }
    model = await Gemma4ForConditionalGeneration.from_pretrained(info.id, {
      revision: info.sha,
      device: "webgpu",
      dtype: usedDtype,
      progress_callback: progress.cb,
    });
    loader = "Gemma4ForConditionalGeneration (fallback)";
  }
  const loadMs = nowMs() - tLoad;
  setText("gemma-stream", "");

  const messages = [
    {
      role: "user",
      content:
        "Escribe una calaverita literaria de 4 líneas, amable y cariñosa, sobre un viejo modelo de inteligencia artificial llamado GPT-2. Responde solo con los 4 versos.",
    },
  ];
  const promptText = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await processor(promptText, null, null, { add_special_tokens: false });
  const promptLength = inputs.input_ids.dims.at(-1);
  const tokenTimes = [];
  const streamer = new TextStreamer(processor.tokenizer, {
    skip_prompt: true,
    callback_function: (text) => {
      $("gemma-stream").textContent += text;
    },
    token_callback_function: () => tokenTimes.push(nowMs()),
  });
  const tStart = nowMs();
  const output = await model.generate({
    ...inputs,
    max_new_tokens: 160,
    do_sample: false,
    streamer,
  });
  const tEnd = nowMs();
  const ids = output.tolist()[0].map(Number).slice(promptLength);
  const answer = processor.tokenizer.decode(ids, { skip_special_tokens: true });
  $("gemma-stream").textContent = answer;

  const stats = timingStats(tStart, tokenTimes, tEnd);
  const bytes = totalOf(progress.files);
  showTimings("gemma-timings", loadMs, bytes, stats);
  report.gemma4 = {
    id: info.id,
    sha: info.sha,
    license: info.license,
    device: "webgpu",
    loaderUsed: loader,
    loaderErrors,
    dtype: usedDtype,
    loadMs: Math.round(loadMs),
    downloadBytes: bytes,
    fileSizes: summarizeFiles(progress.files),
    timings: stats,
    promptText,
    answer,
  };
  state.gemma = { processor, model };
  computeHosts();
}

async function clearCache(kind) {
  const tjs = await loadLibrary();
  const info = kind === "gpt2" ? state.gpt2Info : state.gemmaInfo;
  if (!info) throw new Error("Inspect the model first");
  const res = await tjs.ModelRegistry.clear_cache(info.id, { revision: info.sha });
  setText(
    kind === "gpt2" ? "gpt2-progress-text" : "gemma-progress-text",
    `Cache cleared: ${JSON.stringify(res)}`,
  );
}

async function copyReport() {
  computeHosts();
  const text = JSON.stringify(report, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setText("copy-status", "Copied.");
  } catch (err) {
    recordError("copy", err);
    setText("copy-status", "Clipboard blocked: select the report text below and copy it.");
  }
}

// ---- wiring ---------------------------------------------------------------------------------
function init() {
  $("gpt2-prompt").value = "Once upon a time, an old language model";
  setText(
    "ollama-snippet",
    'for t in gemma:2b gemma2:2b gemma3:1b gemma4:e2b; do ollama pull "$t" && ollama show "$t" --modelfile | head -3; done',
  );
  const wire = (id, step, fn) =>
    $(id).addEventListener("click", () => {
      const btn = $(id);
      btn.disabled = true;
      void guarded(step, fn).finally(() => {
        btn.disabled = false;
        refreshReport();
      });
    });
  wire("btn-lib", "library", loadLibrary);
  wire("btn-env", "environment", checkEnvironment);
  wire("btn-find", "find models", findModels);
  wire("btn-inspect", "inspect", inspectPicked);
  wire("btn-gpt2", "gpt2", runGpt2);
  wire("btn-gpt2-clear", "gpt2 clear cache", () => clearCache("gpt2"));
  $("gemma-dtype-decoder").addEventListener("change", syncDtypeText);
  $("gemma-dtype-embed").addEventListener("change", syncDtypeText);
  wire("btn-gemma", "gemma4", runGemma);
  wire("btn-gemma-clear", "gemma clear cache", () => clearCache("gemma"));
  wire("btn-hosts", "hosts", () => Promise.resolve(computeHosts()));
  $("btn-copy").addEventListener("click", () => void copyReport());
  if (typeof PerformanceObserver !== "undefined") computeHosts();
  setTimeout(refreshReport, 0);
}

init();
