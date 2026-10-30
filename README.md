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
