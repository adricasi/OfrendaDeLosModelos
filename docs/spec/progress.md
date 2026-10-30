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
