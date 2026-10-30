# Tasks: Ofrenda de los Modelos

- Status: Approved <!-- Draft | In review | Approved -->
- Last updated: 2026-10-30

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.
Order = implementation order, riskiest first. Cut order if time runs out: T-009, T-008,
Pythia, hover probabilities (keep screen-reader text), axe in CI (run once locally). Never cut
T-001–T-006, the dark frames and about panel of T-007, or the cultural review.
 Each task is a small vertical slice, references
the requirements it serves, and has an objective "Done when". Times are Spain time; the plan
fits NFR-011 (code freeze Oct 31 18:00, post by 23:00).

At most 2 tasks in parallel. Marked ⚡ where a task can run beside the previous one.

## Milestone 1: Walking skeleton (Thu Oct 30)
- [ ] T-001: Spike — live models in the browser
  - Requirements: REQ-003, REQ-004, REQ-006; NFR-001, NFR-004, NFR-005
  - Depends on: —
  - Scope: a throwaway spike page (not shipped) that loads GPT-2 and Gemma 4 E2B with
    transformers.js on WebGPU in a worker; prints GPT-2's top-3 alternatives per step; asks
    Gemma 4 for one calaverita; logs load time, download size and tokens/s. Finds the model
    repository ids and revisions, the download hosts (for the CSP) and the Ollama tags for
    Gemma 1, 2, 3 and Gemma 4 E2B.
  - Timebox: 3 h. IF Gemma 4 E2B has not answered in the browser by Oct 30 23:00 THEN apply the
    ADR-0003 fallback (recorded Gemma 4 and medium on the site, AC-007.5; live medium only in
    the video via Ollama).
  - Done when: on the founder's laptop (Q-1 closed) GPT-2 streams with alternatives and Gemma 4 E2B
    answers; licences of the ONNX conversion repos checked; timings and sizes recorded in progress.md; pinned ids/revisions and hosts written
    into design.md (the "VERIFY in T-001" items closed); go/fallback decision recorded
    (ADR-0003 consequences).
- [~] T-002: ⚡ Walking skeleton — the altar online
  - Requirements: REQ-001, REQ-009 (skeleton); NFR-001, NFR-003, NFR-006
  - Depends on: —
  - Scope: Vite + TypeScript page with the static altar (levels, cempasúchil, papel picado,
    candles, water), reduced-motion handling, data loading with validation (https-only links;
    `ancestors.json`,
    `offered-questions.json`, `dark-frames.json`, `credits.json` stubs), CSP meta tag, minimal
    GitHub Pages deploy workflow (approved by the founder 2026-10-30); NOTICE that
    `recorded-voices.json` contains model outputs credited to their models, not MIT code.
    GitHub Pages needs the repository public on a free plan (Q-5).
  - Done when: AC-001.1–AC-001.3 tests pass; data validation unit tests pass; CI green; the
    page is live on GitHub Pages.
  - Status note (2026-10-30): code, tests and the Pages workflow are on branch
    `feat/t-002-walking-skeleton`; the remaining Done-when item (live on Pages) needs the merge
    and the founder setting Pages Source to "GitHub Actions" (repository public, Q-5).

## Milestone 2: The ritual (Thu night – Fri Oct 31 morning)
- [~] T-003: Offering and ritual sequencer with a fake model worker
  - Requirements: REQ-002; NFR-002, NFR-009
  - Depends on: T-002
  - Scope: offering form (offered and own questions), sequencer (fixed order, one ritual at a
    time, stop), typed worker messages, a fake worker for tests, Playwright e2e with request
    list assertion and axe.
  - Done when: AC-002.1–AC-002.4 tests pass; e2e asserts no request carries the question
    (NFR-002) and axe reports 0 serious/critical (NFR-009); CI green.
  - Status note (2026-10-30): code, unit tests, e2e and the CI e2e step (Q-6 approved) are on
    branch `feat/t-003-ritual`; "CI green" is confirmed once the PR's checks pass.
- [ ] T-004: GPT-2 speaks, with ghost words
  - Requirements: REQ-003, REQ-004
  - Depends on: T-001, T-003
  - Scope: real inference worker for GPT-2 (pinned revision), token streaming, top-3
    alternatives from the logits, ghost words UI with hover/focus and screen-reader text,
    per-ancestor failure message, "unfiltered 2019 model" label and blocked-token list
    (AC-003.4), ONNX Runtime WebAssembly paths self-hosted (`env.backends.onnx.wasm.wasmPaths`),
    model host added to the CSP, `?debug` console timings (NFR-007), WebAssembly fallback for
    GPT-2 without WebGPU (AC-010.1).
  - Done when: AC-003.1–AC-003.4 and AC-004.1–AC-004.3 unit tests pass (top-k extraction on
    fixed logits; fake-worker UI tests); manual check on the reference laptop; CI green.
- [~] T-005: ⚡ Recording tool and recorded voices (tool done; medium phase pending T-006, voices pending the founder's recording)
  - Requirements: REQ-013, REQ-005
  - Depends on: T-001 (tags); start the Ollama pulls right after T-001 (they take hours)
  - Scope: `npm run record-voices` (Node, Ollama on 127.0.0.1), metadata per answer,
    skip-missing; the builder records Gemma 1, 2, 3 and Gemma 4 E2B answers and the medium's
    words (Gemma 4 E2B with the medium prompt) for each offered question (AC-006.3, AC-007.5,
    REQ-010); replay in the ritual with labels; "only the questions they left" for own
    questions.
  - Done when: AC-013.1–AC-013.3 tests pass with a fake Ollama; AC-005.1–AC-005.4 tests pass;
    `recorded-voices.json` committed with metadata; CI green.
- [ ] T-006: Gemma 4 speaks and tends the altar
  - Requirements: REQ-006, REQ-007
  - Depends on: T-004
  - Scope: Gemma 4 E2B in the worker with consent and progress; its own answer; the medium
    prompt (versioned file) and JSON parser with plain-text fallback; language follows the
    question; small eval of the offered questions.
  - Done when: AC-006.1–AC-006.4 and AC-007.1–AC-007.5 tests pass (parser and sequencing with
    fakes); eval results for the offered questions in English and Spanish recorded in
    progress.md (≥ 4 of 6 usable calaveritas per language, 0 breaking R1–R2); CI green.

## Milestone 3: Honour and reach (Fri Oct 31, until 18:00 freeze)
- [~] T-007: Dark frames, about panel, unsupported browsers (code done; cultural review pending, copy due Oct 31 12:00)
  - Requirements: REQ-008, REQ-009, REQ-010
  - Depends on: T-003, T-005
  - Note: the consent-decline flow of AC-006.3 (the visitor declines the Gemma 4 download) belongs to
    T-006; T-007 only provides the recorded Gemma 4 replay it falls back to (no-WebGPU path).
  - Scope: `dark-frames.json` with official sources only; about panel with every model's
    licence and the cultural sources; no-WebGPU path with the recorded ritual.
  - Done when: AC-008.1–AC-008.2, AC-009.1–AC-009.4, AC-010.1–AC-010.2 tests pass; licence check
    passes (NFR-008); **ritual copy and sample medium outputs sent to the cultural reviewer by
    Oct 31 12:00** (NFR-010); CI green.
- [ ] T-008: ⚡ Offline after the first visit
  - Requirements: REQ-011; NFR-003
  - Depends on: T-006
  - Scope: service worker for the app shell and data; models served from the browser cache.
  - Done when: AC-011.1 checked manually with the network off on the reference laptop; result
    in progress.md; CI green.
- [ ] T-009: Stretch — photo offering (only if T-001..T-007 are done by Oct 31 12:00)
  - Requirements: REQ-012
  - Depends on: T-006
  - Scope: add a photo (file or camera), Gemma 4 vision places the object on the altar; objects
    only; photo kept in memory only.
  - Done when: AC-012.1–AC-012.3 checked (unit tests for the flow with fakes; manual check with
    a real photo); CI green.

## Milestone 4: Publish (Fri Oct 31, 18:00 – 23:00)
- [ ] T-010: Release and post
  - Requirements: NFR-004, NFR-005, NFR-010, NFR-011; G-5
  - Depends on: T-007 (T-008, T-009 if done)
  - Scope: code freeze at 18:00; final timings and sizes; cultural review of every ritual text
    by a reader of Mexican background (or the "review pending" note, NFR-010); README (what,
    how to run, models and licences); 60 s video with Wi-Fi off (online if T-008 was cut, and
    the offline success metric dropped); DEV post ("The only AI that can come back from the dead"), drafted
    from Thu night; repository public (from T-002 if Pages needs it, Q-5).
  - Done when: review notes and timings in progress.md; README complete; post published on DEV
    before 23:00; repository public.
