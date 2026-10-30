# ofrenda-de-los-modelos

An altar where open-weight AI models come home for Día de los Muertos; Gemma 4 tends it on your device

A static page: you leave a question on a Día de los Muertos altar and open-weight models
answer, oldest first, with Gemma 4 tending the altar on your device. Nothing you type leaves
the browser: no backend, no analytics, no storage. The altar is plain TypeScript, Vite and
original CSS/SVG art; its data lives in `public/data/`.

## Getting started
```bash
npm ci                                   # install from lockfile
npm run dev                              # dev server (see note below)
npm test                                 # tests (npm test -- --coverage)
npm run lint && npm run typecheck        # lint + types
npm run format                           # format
npm run build                            # production build to dist/
npm run preview                          # serve dist/ locally under /OfrendaDeLosModelos/
npm audit --audit-level=high             # dependency vulnerabilities
```

The page carries a Content Security Policy as a meta tag (`index.html`). The production
build satisfies it. Vite's dev server injects styles inline, which that policy blocks, so
`npm run dev` serves the page without the CSP; use `npm run build && npm run preview` to
check behaviour under the policy.

## Recording the voices
The recorded voices (Gemma 1, 2, 3 and Gemma 4 E2B, plus the medium's words) are made once on the
builder's laptop with [Ollama](https://ollama.com) and committed as
`public/data/recorded-voices.json`. The site never calls Ollama. The tool only talks to Ollama on
loopback (`127.0.0.1`, `localhost`, `::1`), never follows redirects, and refuses any other host.

```bash
npm ci
ollama serve                      # if Ollama is not already running
ollama pull gemma:2b && ollama pull gemma2:2b && ollama pull gemma3:1b && ollama pull gemma4:e2b
npm run record-voices -- --allow-unverified   # writes public/data/recorded-voices.json
```

- Settings live in `scripts/record-voices.config.json`: ancestors with their Ollama tag and model
  licence, temperature 0, fixed seed, `num_predict` 120, optional `timeoutSeconds`
  (`generate` 300, `quick` 10). The tags are candidates marked `"verified": false`: check each
  exists in the Ollama library and correct the config, then set it to `true`. Until then the tool
  refuses to run without `--allow-unverified`.
- Every offered question is asked in English and Spanish. Each answer is stored exactly as the
  model wrote it (only leading and trailing whitespace is trimmed), with model name, tag, digest
  (from `/api/tags`), licence, settings, the question text, UTC recording date and Ollama version.
- A model that is not installed is skipped with a message. If one ancestor fails mid-run (HTTP
  error, timeout) it is reported, its earlier recordings are kept, the others are written, and the
  command exits non-zero.
- Re-runs keep an entry unchanged (and do not ask the model again) when the model digest, the
  settings and the question are the same. Entries for ancestors or questions that no longer exist
  are dropped.
- The medium's words (AC-007.5) are off until the prompt file `scripts/medium-prompt.txt` exists
  (T-006; placeholders `{{question}}` and `{{answers}}`). Then set `medium.enabled` to `true`. The
  prompt's SHA-256 is stored with each entry.
- Output is validated (`src/data/recorded-voices.ts`, including that ids match the offered
  questions and the configured ancestors) before it is written, with stable key order.

## Deploying
`.github/workflows/pages.yml` builds the site and publishes `dist/` to GitHub Pages on every
push to `main` (and on manual run). One-time setup by the repository owner: in
Settings, Pages, set Source to "GitHub Actions". The site is served under
`/OfrendaDeLosModelos/` (the Vite `base`).

## Licences
Code and art: MIT (see `LICENSE`). Model outputs recorded later are credited to their models
and are not MIT code (see `NOTICE`).

## Development workflow (AI-assisted, spec-driven)
Built with the personal ai-toolkit (`~/ai-toolkit`). In Claude Code:
1. `/spec` — define or refine the specification in `docs/spec/` (once, then when requirements change).
2. `/project-kit` — tailor project-specific agents and skills to the spec.
3. `/next` — implement the next task: branch, tests from acceptance criteria, code, checks, review, commit.
4. `/review-all` then `/ship` — full review (Claude + Gemini) and PR preparation.
5. `/handoff` — leave a progress note for the next session.
Commits run pre-commit (formatters, linters, gitleaks); agents may push feature branches and open pull requests; merging is done by a human.

## Specification
See [docs/spec](docs/spec/): product, requirements, design and task plan.

## Architecture decisions
See [docs/adr](docs/adr/).
