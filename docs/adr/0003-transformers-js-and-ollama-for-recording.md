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
