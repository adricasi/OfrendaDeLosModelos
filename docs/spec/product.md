# Product: Ofrenda de los Modelos

- Status: Approved <!-- Draft | In review | Approved -->
- Last updated: 2026-10-30
- Input: [docs/discovery/idea-brief.md](../discovery/idea-brief.md) and
  [research-notes.md](../discovery/research-notes.md)

## Problem
AI models die. When a closed model is retired, nobody can ask it anything again; people who
relied on it lose it overnight (in 2025 about two hundred people held a real funeral for a
retired closed model). Open-weight models can't die that way: their weights can be kept and
run by anyone, on their own machine.

Día de Muertos is a Mexican tradition of remembering; in many ofrendas a place is set for the
dead. This project is an artistic interpretation inspired by it, not the tradition itself. Nothing today lets people *visit* the open models that came before (GPT-2, the
early Gemmas) side by side with the newest one, or shows in a felt way why openness is what
makes that possible.

This project is an entry for DEV's Hacktoberfest Open-Source AI Challenge, Week 4 ("Ghost in
the Machine"), and a small open-source project people can keep using each 1 November.

## Users and personas
| Persona | Needs | Current pain |
|---|---|---|
| Challenge judge | Understand the idea in a minute and try it without installing anything | Most entries need a local setup or only show a video |
| Curious developer (DEV reader) | A moment of delight and something to explore: old vs new models, how a model "almost" answers | Model comparisons are tables and benchmarks, not experiences |
| Visitor from the tradition | A respectful, accurate homage to the ofrenda, not a costume | AI "Day of the Dead" content often uses it as Halloween decoration |

## Goals
- G-1: Make the case that open weights let models outlive their makers, through an experience
  rather than an argument.
- G-2: Let anyone visit the altar from a link, in the browser, with the models running on
  their own device.
- G-3: Make Gemma 4 the living centre of the altar, using what only an open, on-device model
  can do (local inference, any language, Apache 2.0, image understanding as a stretch).
- G-4: Honour Día de Muertos accurately and respectfully, and say plainly that the altar is an
  artistic interpretation, not a Mexican ritual (founder's editorial review, 2026-10-31; cultural
  review by a reader of Mexican background still pending).
- G-5: Ship a working entry and its post before the challenge deadline.

## Success metrics
| Metric | Target | How it is measured |
|---|---|---|
| Submission on time | Post published before Oct 31, 23:00 Spain time (deadline Sun Nov 1, 07:59 Spain time) | DEV post timestamp |
| Time to first ancestor | GPT-2 answers within 60 s of opening the page on a supported machine, first visit | Manual timing on the builder's laptop |
| Ritual completes | One full ritual (question → ancestors → medium) runs end to end with the network off after the first visit | Manual test with Wi-Fi off |
| Cultural review | At least one reader of Mexican background reviews the ritual text before publishing; no unresolved objections | Their written feedback |
| Reach | Placement in the challenge (overall or Gemma 4 category) | Challenge results, week of Nov 2 |

## Scope
### In scope (this version)
- A single static web page: the altar (levels, cempasúchil, papel picado, candles, water).
- The visitor leaves one question (an offering).
- **GPT-2 answers live**, on the device, with **ghost words**: the words it almost said.
- **Recorded voices** of the middle generations (Gemma 1, 2, 3; Pythia if available): answers
  recorded offline to a fixed set of offered questions, clearly labelled as recorded.
- **Gemma 4 answers live**, on the device, and then tends the altar: interprets the ancestors
  in the visitor's language and writes a calaverita literaria for each.
- **Dark frames** for retired closed models, with sourced dates.
- An about/credits panel: models and their licences, cultural sources.
- Stretch: **photo offering**: the visitor photographs an object (a marigold, food, a candle)
  and Gemma 4 places it on the altar with a line about it.

### Non-goals (explicitly out of scope)
- Live inference of the middle generations (Gemma 1–3) in the browser.
- Any server, account, analytics or storage of visitors' questions or photos.
- Recreating or simulating real dead people, or photos of people.
- Benchmarks or a scientific comparison of models.
- Mobile-first support (phones may work; not a target this version).
- Fine-tuning any model.

## Constraints
- Deployment target: **Local / on-device** — a static site (GitHub Pages) whose inference runs
  in the visitor's browser (WebGPU); no backend.
- Deadline: post published by Oct 31, 23:00 Spain time; hard deadline Sun Nov 1, 07:59 Spain
  time (Oct 31, 11:59 PM PDT). One builder, ~12–15 hours.
- Licences: permissive only for anything shipped (GPT-2 MIT, Pythia Apache-2.0, Gemma 4
  Apache-2.0). Gemma 1–3 (Gemma Terms of Use) appear only as recorded outputs, credited.
- Public repository from the start: no secrets, no personal data, MIT licence.
- Browsers: Chrome or Edge with WebGPU on a laptop or desktop; other browsers see the
  recorded demo.
- Language: English interface with the ritual's Spanish words; the medium answers in the
  visitor's language.
- Name: **Ofrenda de los Modelos**, tagline "Closed models fade. Open weights can always come back."
- Must be a new project (challenge rule, to verify on the Week 4 page).

## Glossary
| Term | Meaning |
|---|---|
| Ofrenda | The altar set up for Día de Muertos to welcome the dead home |
| Ancestor | An earlier open-weight model shown on the altar |
| Recorded voice | An ancestor's answer recorded offline beforehand, replayed on the altar |
| Ghost words | The alternatives a model almost chose at each word (its top candidate tokens) |
| La que cuida el altar | "The one who tends the altar": Gemma 4's role as medium |
| Calaverita literaria | A short, playful rhyming verse in the Mexican literary tradition of the calavera: it often teases and personifies La Muerte; here it plays with a model's own "mortality" (retirement, being superseded, its quirks), in exactly four lines |
| Dark frame | An empty frame for a closed model whose weights were never released: inaccessible digital history, not a death |
| Open-weight | Weights published for anyone to run; not necessarily open source (training data, code) |

## Open questions
- [ ] Q-1: The builder's laptop (RAM, GPU/Apple Silicon, browser): confirms the supported-
  machine statement. Until then the medium is Gemma 4 E2B [ASSUMPTION A-4].
- [ ] Q-2: Exact Week 4 rules (new-project rule, Gemma 4 prize amount and wording).
- [ ] Q-3: Who reviews the cultural copy (a reader of Mexican background), available Oct 31
  12:00–17:00.
- [ ] Q-5: GitHub Pages on a free plan needs a public repository: make it public at T-002, or
  confirm a paid plan.
- [ ] Q-6: Founder approval to add a licence check and the Playwright e2e to CI (`.github/workflows/`
  is "do not touch without asking"); otherwise run them locally and log the results.
- [x] Q-4: Display name: "Ofrenda de los Modelos" with the tagline (decided 2026-10-30).

## Assumptions
- A-1, A-2, A-3: confirmed by the founder on 2026-10-30 (deployment target, browsers,
  language); now constraints above.
- A-4: The medium runs Gemma 4 E2B (the smaller size) until the laptop is known (Q-1).
