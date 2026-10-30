# Progress log: ofrenda-de-los-modelos

Session handoff notes, newest last. Appended by `implement-task` and `/handoff`.
The latest entry is shown to Claude at the start of every session.

<!-- Entry format:
## YYYY-MM-DD — T-nnn: <title> (done | partial | blocked)
- Done: what was completed (files, tests)
- Decisions: choices made and why (link ADRs)
- Issues: problems found, spec questions raised
- Next: the exact next step
-->

## 2026-10-30 — T-002: Walking skeleton — the altar online (partial)
- Done: Vite 8.3.4 + strict TypeScript, plain DOM; static altar in original CSS/SVG (levels,
  cempasúchil, papel picado, candles, water, one framed place per ancestor), about panel
  (models + licences, cultural sources, art statement, on-device statement), dark frames
  (4 official-source entries); `public/data/*.json` with hand-written https-only validators
  (`src/data/validate.ts`); CSP meta incl. `require-trusted-types-for 'script'`; Pages workflow
  with SHA-pinned actions; NOTICE; README. 42 tests pass; lint, typecheck, build, audit clean.
- Decisions: vitest bumped 3 to 5.0.5 (tinypool critical advisory); dev server serves without
  the CSP meta (Vite injects inline styles); `modulePreload.polyfill` off to keep the bundle
  free of injected code.
- Issues: not loaded in a real browser here (none available), so Trusted Types/CSP behaviour is
  checked by test and by inspecting `dist/` (no inline code, no HTML sinks), not by a console
  run. Years of service in dark frames are `null` (hidden) until supplied (AC-008.1). Model ids,
  revisions and generation settings are `null` pending T-001/T-004.
- Next: founder merges and sets Pages Source to "GitHub Actions"; verify the live URL with the
  CSP in Chrome (console clean); then T-003.

## 2026-10-30 — T-003: Offering and ritual sequencer with a fake model worker (partial)
- Done: offering form (offered questions in English/Spanish with `lang`, own question 1–280
  characters trimmed, inline errors, Stop, one ritual at a time); sequencer in plain code
  (`src/ritual/`: GPT-2 live, recorded voices, Gemma 4 live, medium) behind `RitualStep`
  interfaces, per-step failure isolation, AbortSignal cancellation; typed worker protocol
  (`src/worker/protocol.ts`), fake worker (`src/fake/`), `?fake-models` honoured only in a
  `--mode test` build (production bundle test in `test/fake-mode.test.ts`); streaming UI with
  speaking-candle flicker and one polite announcement per completed answer. 85 unit tests and 8
  Playwright e2e tests pass (request list, keyboard-only flow, axe 0 serious/critical).
- Decisions: `@playwright/test` 1.64.1 (Apache-2.0) and `@axe-core/playwright` 4.14.0 (MPL-2.0,
  dev-only, not shipped) pinned; e2e uses `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for a preinstalled
  browser. Until T-004/T-005/T-006 the production build wires an "unavailable" worker and no
  recordings, so live and recorded ancestors show "could not come tonight" and there is no medium.
- Issues: e2e is not in CI until the founder approves the workflow change (Q-6); axe-core is MPL-2.0
  (not in the permissive list; dev-only, so NFR-008's shipped-code rule is unaffected).
- Next: T-004 plugs the real GPT-2 worker into `ModelWorkerPort`; T-005 supplies the
  `RecordedVoiceSource`; add `npm run test:e2e` to CI once approved.
- Review round (2026-10-30): CI runs e2e; privacy test checks UTF-8 bodies and WebSockets and has a
  negative control; protocol gained `cancel-load`; `StepContext.previous` and
  `SpokenOutcome.notes` (medium notes, rendered one block per ancestor inside the medium's step)
  added for T-006.

## 2026-10-30 — T-005: Recording tool (partial: tool done, voices not yet recorded)
- Done: `npm run record-voices` (`scripts/ollama.ts`, `record.ts`, `record-voices.ts`, config,
  compiled with `scripts/tsconfig.json`, no new dependencies); `src/data/recorded-voices.ts`
  (schema, validation, deterministic serialisation); placeholder `public/data/recorded-voices.json`
  (empty); 32 tests with a fake Ollama on 127.0.0.1 (AC-013.1-AC-013.3, loopback only, validation,
  deterministic output); README section.
- Decisions: answers recorded in English and Spanish per question; medium phase supported but
  disabled until `scripts/medium-prompt.txt` exists (T-006), and it sees only recorded answers
  (GPT-2 is live in the browser); skipped ancestors keep earlier recordings.
- Issues: Ollama tags are unverified candidates; request fields checked against Ollama
  docs/api.md and docs/modelfile.mdx (main branch), not against a running Ollama.
- Next: founder runs the pulls and `npm run record-voices`, verifies tags, commits the JSON
  (closes T-005 "Done when"); UI replay (AC-005.1-AC-005.4) is T-003.
- Review fixes (2026-10-30): redirect refused and timeouts in the client; loopback bypass tests; one timestamp per run and unchanged entries reused; per-ancestor failure isolation with non-zero exit; stale ids dropped and checked; --allow-unverified required for unverified tags; T-005 marked [~].

## 2026-10-30 — T-007: Dark frames, about panel, unsupported browsers (partial: cultural review pending)
- Done: WebGPU detection (`src/ritual/gpu.ts`, `navigator.gpu` + `requestAdapter`); without it one line
  naming Chrome or Edge on desktop, GPT-2 asks for `backend: "wasm"` (optional field on the worker
  `load` message; T-004 must honour it), Gemma 4 and the medium are replayed from
  `recorded-voices.json` (`src/data/recorded-source.ts`), every answer labelled recorded, own
  questions get "waiting to be invited", empty recordings get "still being gathered" (new outcome
  `gathering`, no error). About panel: recorded voices worded "Model licence: …; output reproduced
  with attribution", medium line, "Cultural review pending" note driven by `culturalReviewPending`
  in `credits.json` (true until the founder's review). Dark frame rendering tests. Licence check
  `npm run licences` (`tools/check-licences.mjs`, allowlist with reasons in
  `tools/licence-allowlist.json`; MIT-0 and CC0-1.0 dev-only packages allowlisted) and one CI step.
  `docs/cultural-review.md` lists every ritual text for the reviewer. 165 unit and 15 e2e tests pass.
- Issues: `dark-frames.json` has `yearsOfService: null` for all four frames, so AC-008.1's "years of
  service" is hidden until verified official dates are added (not invented). The e2e uses the fake
  worker: the wasm path is proven only to the `load` message until T-004. The shipped build has no
  recordings until the founder runs `npm run record-voices`.
- Next: founder sends `docs/cultural-review.md` and sample medium outputs by Oct 31 12:00; set
  `culturalReviewPending` to false after approval; T-004 handles `backend: "wasm"`.
