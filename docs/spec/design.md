# Design: Ofrenda de los Modelos

- Status: Approved <!-- Draft | In review | Approved -->
- Last updated: 2026-10-30
- Deployment target: **Local / on-device** (static site; inference in the visitor's browser).
  This design applies the "Local / on-device" column of the spec skill: no cloud services,
  Terraform or IAM.

## Overview
One static web page, served from GitHub Pages. Everything that thinks runs in the visitor's
browser: GPT-2 and Gemma 4 run through transformers.js on WebGPU, inside a Web Worker. The
middle generations are recorded voices: JSON recorded once, offline, on the builder's laptop
with Ollama, and replayed. The ritual is a fixed sequence in plain code; the models only
generate text. Nothing the visitor types or shows leaves the device.

```
GitHub Pages (static files)          Model host (Hugging Face, pinned revisions)
   │ index.html, JS, CSS, data/*.json        │ ONNX weights (downloaded once, cached)
   ▼                                         ▼
┌──────────────────────── visitor's browser ────────────────────────┐
│ Altar UI (main thread) ── messages ──► Inference worker (WebGPU)  │
│   ritual sequencer                       transformers.js           │
│   recorded voices, dark frames           GPT-2 · Gemma 4           │
│   Cache Storage (models) · service worker (app shell, offline)     │
└────────────────────────────────────────────────────────────────────┘
Builder's laptop only:  record-voices script ──► Ollama (localhost) ──► data/recorded-voices.json
```

## Options considered
| Option | Pros | Cons | Verdict |
|---|---|---|---|
| A. Static site, in-browser inference (transformers.js + WebGPU) | One link, no install; truly on the visitor's device; €0; offline after first visit | Large first download; WebGPU only in Chromium browsers; only small models live | **Chosen** ([ADR-0002](../adr/0002-static-site-with-in-browser-inference.md), [ADR-0003](../adr/0003-transformers-js-and-ollama-for-recording.md)) |
| B. Local app: Node server + Ollama, all ancestors live | Every generation live; simplest model handling | Judges must install Ollama and pull ~10 GB; nobody tries it | Rejected (reach) |
| C. A + optional "bring your own ancestors" from a local Ollama on `localhost` | Power users get live middle generations | More surface (CORS, CSP, mixed content); no time before the deadline | Later (not this version) |

## Components
| Component | Runs where | Responsibility |
|---|---|---|
| Altar UI | Browser main thread | Renders the altar (REQ-001), offering form (REQ-002), streams answers, ghost words (REQ-004), dark frames (REQ-008), about panel (REQ-009), unsupported-browser path (REQ-010) |
| Ritual sequencer | Browser main thread | Fixed order: GPT-2 live → recorded voices → Gemma 4 live → medium; one ritual at a time, cancellable (AC-002.4); per-ancestor failure isolation (AC-003.3, AC-006.4) |
| Inference worker | Web Worker, WebGPU | Loads and runs GPT-2 and Gemma 4 with transformers.js; streams tokens; for GPT-2 also returns the top-3 alternatives per step from the logits (REQ-004); download progress; model-specific settings from `ancestors.json` |
| Medium prompt + parser | Worker (generation), main thread (parse) | Builds Gemma 4's prompt from the question and all answers; parses its JSON reply into one entry per ancestor; falls back to plain text (AC-007.4) |
| Service worker | Browser | Caches the app shell and data files for offline use (REQ-011); model files are cached by transformers.js in Cache Storage |
| Recording tool | Builder's laptop (Node) | Asks each middle ancestor each offered question through Ollama on localhost; writes `recorded-voices.json` with full metadata (REQ-013) |

## Data model
All data is static JSON in `public/data/`, validated at load (fail fast with a clear error).
| File | Content |
|---|---|
| `ancestors.json` | Per ancestor: `id`, display name, family, year, size, licence + licence URL, model card URL, `kind` (`live` / `recorded`), for live ones the model repository id and pinned revision, generation settings (max tokens, temperature) |
| `offered-questions.json` | ~6 questions: `id`, text in English and Spanish |
| `recorded-voices.json` | Per (ancestor, question): answer text, model tag, digest, licence, settings, recording date, runtime version |
| `dark-frames.json` | Per retired closed model: name, maker, years of service, retirement date, official source URL (AC-008.2) |
| `credits.json` | Cultural sources (title, publisher, URL) |

No visitor data is stored (NFR-002). The question lives only in page memory.

## Interfaces
- **UI ↔ worker messages** (typed): `load(modelId)` → `progress{loaded,total}` → `ready`;
  `generate(modelId, prompt, settings)` → `token{text, alternatives?: {text, p}[]}`* → `done` |
  `error{message}`; `cancel`.
- **Medium output** (requested as JSON, validated): `[{ancestorId, meaning, calaverita: [4 lines]}]`.
- **Recording tool**: `npm run record-voices` → Ollama HTTP API on `http://127.0.0.1:11434`
  (builder's laptop only; never called by the site).
- No public API, no backend.

## Security design
- **Trust boundary:** the visitor's browser. The site has no server-side code, accounts or
  secrets. The repo is public and holds no credentials (CI secret scan).
- **Network exposure:** a Content Security Policy (meta tag; GitHub Pages can't set headers):
  `default-src 'self'`; `script-src 'self' 'wasm-unsafe-eval'` (ONNX Runtime WebAssembly);
  `worker-src 'self' blob:`; `connect-src 'self'` plus the model host(s) [VERIFY in T-001: the
  exact Hugging Face download hosts after redirects]; `img-src 'self' data: blob:`;
  `style-src 'self'`; `object-src 'none'`; `base-uri 'self'`;
  `require-trusted-types-for 'script'`. (`frame-ancestors` has no effect in a meta CSP; accepted.) ONNX Runtime's WebAssembly files
  are served from the site itself, not a CDN.
  `'self'` on GitHub Pages is the shared `adricasi.github.io` origin (every project site of
  that account); we accept this.
- **Data protection:** questions, answers and photos stay in memory; nothing is written to
  storage except model files and the app shell (NFR-002). Photos (REQ-012) are never stored;
  EXIF is irrelevant because nothing leaves the page.
- **Top threats and mitigations:**
  | Threat | Mitigation |
  |---|---|
  | XSS through model output (models can emit HTML/JS-like text) | Render all model and data text with `textContent`, never `innerHTML`; CSP blocks inline scripts |
  | Tampered or swapped model files | Pin each model to a repository revision (commit hash) in `ancestors.json` for weights, config and tokenizer files alike; download only from that revision. Residual risk: no per-file hash check, so integrity relies on TLS plus the pinned commit |
  | Script URLs in data (`javascript:` links) | The data validator accepts only `https:` links for sources, credits and model cards |
  | GPT-2's unfiltered output on a memorial altar | "Unfiltered 2019 model" label, curated offered questions, blocked-token list where supported (AC-003.4) |
  | Supply-chain risk in npm dependencies | Few dependencies, lockfile, `npm audit` and licence check in CI, Dependabot |
  | Third-party script injection (CDNs) | No third-party scripts; ONNX Runtime assets self-hosted; CSP |
  | The medium saying something hurtful or speaking as a real person | Prompt rules (AC-007.3), offered questions curated, outputs reviewed in the cultural review |
  | A photo of a person (REQ-012) | Prompt instructs objects only; the model declines gently (AC-012.2) |

## Reliability and operations
- **Offline:** after one complete ritual the service worker serves the app shell and data,
  and transformers.js serves models from Cache Storage (REQ-011).
- **No WebGPU:** GPT-2 runs on the WebAssembly backend; Gemma 4 and the medium are replayed from
  recordings (AC-010.1, AC-007.5).
- **A model is unavailable:** per-ancestor isolation; the ritual continues with a short
  message (AC-003.3, AC-006.4). No WebGPU: recorded ritual (REQ-010).
- **Low memory / slow device:** Gemma 4 runs only after the visitor consents to the download
  (AC-006.2); declining falls back to the recorded Gemma 4 voice (AC-006.3).
- **Observability:** no telemetry (NFR-007). With `?debug`, load times, tokens/s and errors go to
  the browser console.
- **User data backup/export:** none to back up (nothing is stored).

## Environments and deployment
- **Supported machines:** desktop Chrome or Edge with WebGPU; ≥ 8 GB RAM; ~2.5 GB free for
  the model cache [ASSUMPTION A-4: Gemma 4 E2B until the reference laptop is known, Q-1].
- **Dev:** `npm run dev` (Vite) on localhost.
- **Prod:** GitHub Pages, built and published by a GitHub Actions workflow (a new workflow:
  approved by the founder on 2026-10-30; `.github/workflows/` is otherwise "do not touch
  without asking").
- **Models:** downloaded by the visitor's browser from the pinned revisions; never committed
  (`.gitignore` already excludes model files).
- **Recorded voices:** the builder runs Ollama locally, pulls the pinned tags
  [VERIFY in T-001: Ollama tags for Gemma 1, 2, 3 and Gemma 4 E2B], runs `npm run record-voices`,
  commits the JSON.

## Testing strategy
- **Unit (Vitest):** data validation, ritual sequencing (with a fake worker), offering
  validation (AC-002.3), top-k extraction from logits (AC-004.1, AC-004.3), medium parser and
  fallback (AC-007.4), dark-frame source rule (AC-008.2), recording tool with a fake Ollama.
- **End to end (Playwright, Chromium):** the full ritual with a **fake model worker** (build
  flag), asserting the request list (NFR-002), the CSP, keyboard flow and axe 0
  serious/critical (NFR-009), the unsupported-browser path (REQ-010).
- **Manual on the reference laptop:** real models, timings (NFR-004), download sizes
  (NFR-005), offline (REQ-011); results in progress.md.
- **Quality of the medium:** a small eval of ~6 questions × the calaverita format (4 lines,
  kind, in the question's language), judged by the builder and the cultural reviewer.

## Cost estimate
- Running cost: **€0/month** (GitHub Pages; inference on visitors' devices; no paid APIs).
- Hardware for visitors: see supported machines. Builder: a laptop able to run Ollama for the
  recordings.

## Decisions
- D-1: Local / on-device target, static site with in-browser inference —
  [ADR-0002](../adr/0002-static-site-with-in-browser-inference.md).
- D-2: transformers.js + WebGPU in a Web Worker for live models; Ollama only for recording the
  middle generations — [ADR-0003](../adr/0003-transformers-js-and-ollama-for-recording.md).
- D-3: No UI framework: TypeScript + Vite + plain DOM (one page; smallest bundle and
  dependency surface).
- D-4: Ritual order is plain code, not an agent loop (predictable demo).

## Traceability
| Requirement | Design sections |
|---|---|
| REQ-001 | Components (Altar UI); Environments |
| REQ-002 | Components (Altar UI, Ritual sequencer) |
| REQ-003 | Components (Inference worker); Interfaces; Reliability |
| REQ-004 | Components (Inference worker); Interfaces (`alternatives`); Testing |
| REQ-005 | Data model (`recorded-voices.json`); Components (Ritual sequencer) |
| REQ-006 | Components (Inference worker); Reliability (consent, fallback) |
| REQ-007 | Components (Medium prompt + parser); Interfaces; Security (threats) |
| REQ-008 | Data model (`dark-frames.json`); Testing |
| REQ-009 | Data model (`ancestors.json`, `credits.json`); Components (Altar UI) |
| REQ-010 | Reliability; Components (Altar UI) |
| REQ-011 | Components (Service worker); Reliability |
| REQ-012 | Components (Inference worker); Security (photo) |
| REQ-013 | Components (Recording tool); Interfaces; Environments |
| NFR-001 | Security design (CSP, threats) |
| NFR-002 | Security (data protection); Testing (request list) |
| NFR-003 | Reliability (offline); Environments (Pages) |
| NFR-004, NFR-005 | Environments (supported machines); Testing (manual) |
| NFR-006 | Cost estimate |
| NFR-007 | Reliability (debug view) |
| NFR-008 | Data model (licences); Testing (licence check) |
| NFR-009 | Testing (axe, keyboard) |
| NFR-010 | Testing (medium eval, cultural review) |
| NFR-011 | tasks.md (plan and freeze) |
