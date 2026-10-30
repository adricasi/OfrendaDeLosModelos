# 0003. transformers.js for live models, Ollama for recording

- Status: Accepted
- Date: 2026-10-30

## Context
Live models (GPT-2, Gemma 4) must run in the browser and expose per-step token probabilities
for the ghost words. The middle generations (Gemma 1–3) are recorded once on the builder's
laptop and must be reproducible (model tag, digest, settings).

## Decision
- Live: transformers.js with the WebGPU backend, inside a Web Worker, models pinned to a
  repository revision. ONNX Runtime's WebAssembly files are self-hosted.
- Recording: Ollama on the builder's laptop (`127.0.0.1` only), called by a small Node script
  that stores each answer with the model tag, digest, settings and date.
- A spike in T-001 must prove, on the reference laptop, before the rest is built: Gemma 4 E2B
  loads and answers in the browser, GPT-2 exposes top-k alternatives per step, and the
  download hosts needed by the CSP.

## Alternatives
- WebLLM (MLC) in the browser: strong WebGPU performance, but per-step probabilities and
  model availability for Gemma 4 are less certain for this deadline.
- llama.cpp for the recordings: also fine; Ollama was chosen because pinned tags and digests
  are one command each.

## Consequences
- One runtime for both live models; the worker keeps the page responsive.
- If the spike fails for Gemma 4 in the browser, the fallback in the brief applies: the medium
  runs through Ollama for the video, and the site shows recorded Gemma 4 answers.
- transformers.js 4.3.1 (pinned exactly, Apache-2.0) depends on an exact prerelease of
  `onnxruntime-web`, `1.31.0-dev.20260914-8d85527a0`, not on a stable release. The
  self-hosted WebAssembly files (`ort/ort-wasm-simd-threaded.asyncify.{mjs,wasm}`) are copied
  from that build, so upgrading transformers.js changes the ONNX Runtime build that ships;
  upgrade deliberately and re-run the browser checks. The library also contains its own
  jsDelivr fallback for these files: the build rewrites it to the site's `ort/` folder and
  fails if it finds that fallback in a form it does not recognise (`vite.config.ts`).
- The page's meta CSP does not apply to the inference worker (see design.md, Security design),
  so the worker's network exposure is bounded by its code, a build-time check of hosts in the
  bundle and an e2e test of all requests, not by `connect-src`.
