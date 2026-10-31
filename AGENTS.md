# Ofrenda de los Modelos

An artistic tribute to the memory of AI models, inspired by the Mexican tradition of Día de Muertos; Gemma 4 tends the altar on your device.
*Closed models die. Open weights come home.*

> Global engineering standards are loaded automatically from `~/ai-toolkit/AGENTS.md`
> (Claude Code via `~/.claude/CLAUDE.md`, Gemini via `~/.gemini/AGENTS.md`).
> This file only adds what is specific to this project. Keep it short and current.

## Specification
Specification: docs/spec/ — the source of truth: `product.md` (why), `requirements.md` (what, with
REQ/AC IDs), `design.md` (how), `tasks.md` (plan). Build with the `implement-task` skill;
change the spec first (`spec` skill) when requirements change. Reference IDs in commits.

## Project overview
A static web page (GitHub Pages) where the visitor leaves a question on a Día de Muertos
altar and open-weight models answer, oldest first: GPT-2 live with "ghost words" (the words it
almost said), recorded voices of Gemma 1–3, then Gemma 4 live on the visitor's device, which
tends the altar and writes a calaverita for each ancestor. Closed models with unreleased weights appear
as dark frames. Entry for DEV's Hacktoberfest Week 4 challenge; code freeze Oct 31 18:00 Spain time.
Details: [product.md](docs/spec/product.md).

## Stack
- TypeScript (strict) on Node.js LTS, ESM
- Vitest (+ v8 coverage), ESLint (typescript-eslint, type-checked), Prettier, npm audit

## Architecture
- Static site, no backend (ADR-0002). TypeScript + Vite + plain DOM (no UI framework).
- Live models run in the browser: transformers.js (`@huggingface/transformers`, pinned) on
  WebGPU inside a Web Worker (ADR-0003). ONNX Runtime WebAssembly files are self-hosted.
- Data is static JSON in `public/data/` (ancestors, offered questions, recorded voices, dark
  frames, credits), validated at load.
- Recorded voices are made on the builder's laptop with Ollama (`npm run record-voices`).
- Full design: [design.md](docs/spec/design.md).

## Commands
```bash
npm ci                                   # install from lockfile
npm test                                 # tests (npm test -- --coverage)
npm run lint && npm run typecheck        # lint + types
npm run format                           # format
npm run build                            # compile to dist/
npm audit --audit-level=high             # dependency vulnerabilities
```

## Project rules
- Keep this repository's CI green; run the commands above before committing.
- Record significant decisions as ADRs in `docs/adr/` (use the `adr` skill).
- Pin exact versions of `@huggingface/transformers` and model revisions; upgrade deliberately.

## Domain rules
- Nothing the visitor types or photographs leaves the device: no backend, analytics, cookies
  or storage of questions/answers/photos. The only network requests are the site's own files
  and model downloads from pinned revisions (NFR-002).
- Render every model output and data string as text (`textContent`), never as HTML.
- Never invent ghost words: they come only from the model's own probabilities at that step.
- Recorded voices are shown exactly as recorded and always labelled as recorded, with model,
  version, licence and date. A dark frame needs an official retirement source.
- "Ancestors" is a metaphor for earlier models: they are software, never equated with dead people
  or anyone's family; dark frames mean inaccessible digital history, not death. The medium may
  tease but never mocks or demeans a model, never speaks as a real person; the altar receives
  photos of objects, never people.
- The altar is an artistic interpretation, not a Mexican ritual, and one possible arrangement of
  an ofrenda (not the standard). Never claim cultural approval while `culturalReviewPending` is
  `true` in `public/data/credits.json`; the founder's review is editorial, not Mexican cultural
  approval.
- Cultural accuracy: use the ofrenda's real elements and cite sources; no Halloween or
  sugar-skull costume styling; Spanish is written properly (NFR-010).
- Licences: shipped code and models are permissive (MIT, Apache-2.0, BSD, ISC). Gemma 1–3
  appear only as credited recorded outputs (Gemma Terms of Use). Say "open-weight", not
  "open source", for models.
- Public repository: no secrets, no personal data, no model weights committed.

## Project kit
<!-- Filled by the `project-kit` skill: project-specific agents/skills and when to use them. -->

## Do not touch without asking
- `.github/workflows/` (CI and security gates)
- `.claude/settings.json`, `.agents/` (agent configuration)
- `infra/` state/backend configuration
- Exception approved 2026-10-30: one minimal GitHub Pages deploy workflow (T-002).
