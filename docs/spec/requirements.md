# Requirements: Ofrenda de los Modelos

- Status: Approved <!-- Draft | In review | Approved -->
- Last updated: 2026-10-30

IDs are permanent: never renumber or reuse. Deprecate with ~~strikethrough~~ and a note.
Acceptance criteria use EARS style: `WHEN <trigger> [WHILE <state>] THE SYSTEM SHALL <response>`
(or `IF <unwanted condition> THEN THE SYSTEM SHALL <response>`). Each one must be testable.

Terms (ancestor, recorded voice, ghost words, dark frame, ...) are defined in the
[glossary](product.md#glossary). "Supported browser" means desktop Chrome or Edge with WebGPU.

## Functional requirements

### REQ-001: The altar
- Story: As a visitor, I want to arrive at an ofrenda that feels real and respectful, so that
  the ritual has meaning before any model speaks.
- Priority: Must
- Goals: G-2, G-4
- Acceptance criteria:
  - AC-001.1: WHEN the page opens THE SYSTEM SHALL show the altar with its levels, cempasúchil,
    papel picado, candles, water and one place per ancestor, within 3 s on a supported browser
    (before any model is downloaded).
  - AC-001.2: WHEN the page opens THE SYSTEM SHALL state in one line what the altar is, and link
    the about panel (REQ-009).
  - AC-001.3: WHILE the visitor's system prefers reduced motion THE SYSTEM SHALL show the candles
    and petals without animation.

### REQ-002: Leaving an offering
- Story: As a visitor, I want to leave one question on the altar, so that the ancestors answer it.
- Priority: Must
- Goals: G-1, G-2
- Acceptance criteria:
  - AC-002.1: WHEN the visitor chooses one of the offered questions THE SYSTEM SHALL start the
    ritual with that question.
  - AC-002.2: WHEN the visitor writes their own question of 1–280 characters and offers it THE
    SYSTEM SHALL start the ritual with that question.
  - AC-002.3: IF the question is empty or longer than 280 characters THEN THE SYSTEM SHALL not
    start the ritual and SHALL say why, next to the field.
  - AC-002.4: WHILE a ritual is running THE SYSTEM SHALL not accept another offering, and SHALL
    let the visitor stop the current one.

### REQ-003: GPT-2 speaks live
- Story: As a visitor, I want the oldest ancestor to answer in my browser, so that I see an open
  model of 2019 come back to life on my own device.
- Priority: Must
- Goals: G-1, G-2
- Acceptance criteria:
  - AC-003.1: WHEN the ritual starts THE SYSTEM SHALL generate GPT-2's answer on the visitor's
    device and show it word by word as it is produced, while its candle flickers.
  - AC-003.2: WHEN GPT-2 has produced 60 tokens or an end-of-text token THE SYSTEM SHALL stop its
    answer and pass the turn to the next ancestor.
  - AC-003.3: IF GPT-2 cannot be loaded or fails while answering THEN THE SYSTEM SHALL show a
    short message in its place ("this ancestor could not come tonight") and continue the ritual.
  - AC-003.4: THE SYSTEM SHALL label GPT-2's answer as coming from an unfiltered 2019 model, and
    SHALL block a list of offensive tokens from its output where the runtime supports it.

### REQ-004: Ghost words
- Story: As a visitor, I want to see the words the model almost said, so that I feel what is
  happening inside an open model.
- Priority: Must
- Goals: G-1
- Acceptance criteria:
  - AC-004.1: WHEN GPT-2 produces a token THE SYSTEM SHALL show up to 3 alternative tokens it
    almost chose at that step (excluding the chosen one), fainter than the chosen token, with
    each alternative's probability (softmax of that step's logits at the sampling temperature)
    available on hover and focus.
  - AC-004.2: THE SYSTEM SHALL make the ghost words available to screen readers as text
    ("almost: X, Y, Z") without interrupting the reading of the answer.
  - AC-004.3: THE SYSTEM SHALL derive the ghost words only from the model's own probabilities at
    that step (no invented alternatives).

### REQ-005: Recorded voices of the middle generations
- Story: As a visitor, I want to hear the generations between GPT-2 and Gemma 4, so that I see
  the family grow, even though they don't run in my browser.
- Priority: Must
- Goals: G-1, G-3
- Acceptance criteria:
  - AC-005.1: WHEN the ritual runs for an offered question THE SYSTEM SHALL replay, in age order,
    the recorded answer of each middle ancestor (Gemma 1, Gemma 2, Gemma 3, and Pythia when
    recorded) for that question.
  - AC-005.2: THE SYSTEM SHALL label each recorded voice as recorded, with the model, version,
    the model's licence (e.g. "model licence: Gemma Terms of Use; output reproduced with
    attribution") and the recording date.
  - AC-005.3: WHEN the ritual runs for the visitor's own question THE SYSTEM SHALL show, in place
    of each recorded voice, that these ancestors only answer the questions they left for us,
    and continue the ritual.
  - AC-005.4: THE SYSTEM SHALL show each recorded answer exactly as recorded (no edits).

### REQ-006: Gemma 4 speaks live
- Story: As a visitor, I want the newest of the family to answer on my own device, so that I see
  an open model I can keep forever.
- Priority: Must
- Goals: G-2, G-3
- Acceptance criteria:
  - AC-006.1: WHEN the recorded voices have finished THE SYSTEM SHALL generate Gemma 4's own answer
    to the question on the visitor's device and show it as it is produced.
  - AC-006.2: WHEN the visitor's first ritual needs Gemma 4 and it is not yet stored on the device
    THE SYSTEM SHALL tell the visitor the download size and ask for consent before downloading,
    and SHALL show download progress.
  - AC-006.3: IF the visitor declines the download THEN THE SYSTEM SHALL finish the ritual with
    the recorded Gemma 4 answer for offered questions, labelled as recorded, or say Gemma 4 is
    waiting to be invited for the visitor's own question.
  - AC-006.4: IF Gemma 4 fails to load or to answer THEN THE SYSTEM SHALL say so in its place and
    end the ritual without the medium (REQ-007).

### REQ-007: La que cuida el altar (the medium)
- Story: As a visitor, I want Gemma 4 to interpret the ancestors and honour each one, so that the
  ritual ends with meaning and a smile.
- Priority: Must
- Goals: G-3, G-4
- Acceptance criteria:
  - AC-007.1: WHEN every ancestor has answered THE SYSTEM SHALL have Gemma 4, on the device, write
    for each ancestor one or two sentences on what it was trying to say, and a calaverita
    literaria of 4 lines.
  - AC-007.2: WHEN the question is written in English or Spanish THE SYSTEM SHALL have the
    medium answer in the question's language (other languages: best effort).
  - AC-007.3: THE SYSTEM SHALL give the medium prompt rules R1 (be kind, never mock a model for
    its age or size), R2 (never speak as a real person, living or dead) and R3 (4-line
    calaverita per ancestor); in the eval (the offered questions in English and Spanish), 0
    outputs mock a model or speak as a real person.
  - AC-007.4: IF the medium's output cannot be parsed into one entry per ancestor THEN THE SYSTEM
    SHALL show the text it produced as a single message rather than nothing.
  - AC-007.5: IF Gemma 4 cannot run in the visitor's browser THEN THE SYSTEM SHALL show the
    medium's recorded words for offered questions, labelled as recorded.

### REQ-008: Dark frames
- Story: As a visitor, I want to see the models that cannot come, so that I understand why open
  weights matter.
- Priority: Must
- Goals: G-1
- Acceptance criteria:
  - AC-008.1: THE SYSTEM SHALL show a dark frame for each listed retired closed model, with its
    name, its years of service and the line that its weights were never released.
  - AC-008.2: THE SYSTEM SHALL link each dark frame's retirement date to an official source; a
    model without an official source SHALL not be shown. Only `https:` links are accepted for
    sources, credits and model cards.

### REQ-009: About, credits and licences
- Story: As a visitor or judge, I want to know what I'm looking at, which models are used under
  which licences, and where the cultural details come from, so that I can trust it.
- Priority: Must
- Goals: G-1, G-4
- Acceptance criteria:
  - AC-009.1: WHEN the visitor opens the about panel THE SYSTEM SHALL list every model shown (live
    or recorded) with its licence and a link to its model card.
  - AC-009.2: THE SYSTEM SHALL list the cultural sources used for the ofrenda's elements.
  - AC-009.3: THE SYSTEM SHALL state that everything runs on the visitor's device and that no
    question or photo is sent anywhere.
  - AC-009.4: THE SYSTEM SHALL credit every art and font asset with its licence (or state that it
    is original and MIT-licensed with the code).

### REQ-010: Unsupported browsers
- Story: As a visitor without WebGPU, I want to still see the ritual, so that the link is never a
  dead end.
- Priority: Must
- Goals: G-2
- Acceptance criteria:
  - AC-010.1: IF the browser has no WebGPU THEN THE SYSTEM SHALL say so in one line, name the
    supported browsers, run GPT-2 on WebAssembly, and replay the recorded voices, Gemma 4 and
    the medium for the offered questions.
  - AC-010.2: WHILE showing a recorded ritual THE SYSTEM SHALL label every answer as recorded.

### REQ-011: Offline after the first visit
- Story: As a visitor, I want the altar to work with the internet off once the models are on my
  device, so that it shows what open, local AI can do.
- Priority: Should
- Goals: G-1, G-2
- Acceptance criteria:
  - AC-011.1: WHEN the visitor returns with no network after one complete ritual THE SYSTEM SHALL
    load the altar and run a full ritual (GPT-2, recorded voices, Gemma 4, medium).

### REQ-012: Photo offering (stretch)
- Story: As a visitor, I want to place a photo of a real offering on the altar, so that Gemma 4
  sees what I brought.
- Priority: Could
- Goals: G-3, G-4
- Acceptance criteria:
  - AC-012.1: WHEN the visitor adds a photo of an object THE SYSTEM SHALL have Gemma 4, on the
    device, place it on the altar with one line about it.
  - AC-012.2: IF the photo shows a person THEN THE SYSTEM SHALL not describe the person, and SHALL
    say gently that the altar receives objects only (manual check: 3 photos of people → 3/3
    declined; detection depends on the model).
  - AC-012.3: THE SYSTEM SHALL keep the photo only in the page's memory, release its object URL
    when done, and discard it when the page closes.

### REQ-013: Recording the voices (builder tool)
- Story: As the builder, I want to record the middle ancestors' answers reproducibly, so that the
  recorded voices are honest and can be re-recorded each year.
- Priority: Must
- Goals: G-1, G-5
- Acceptance criteria:
  - AC-013.1: WHEN the builder runs the recording command THE SYSTEM SHALL ask each configured
    ancestor (Gemma 1, 2, 3 and Gemma 4) each offered question through a local model runtime,
    then record the medium's words for each offered question, and write everything to the
    recorded-voices file.
  - AC-013.2: THE SYSTEM SHALL store with each answer the model name, exact model tag and digest,
    licence, generation settings and recording date.
  - AC-013.3: IF an ancestor's model is not available locally THEN THE SYSTEM SHALL skip it with a
    clear message and record the others.

## Non-functional requirements
| ID | Category | Requirement (measurable) | Verification |
|---|---|---|---|
| NFR-001 | Security | Static site with no backend and no secrets in the repo. A Content Security Policy allows scripts only from the site itself, and network requests only to the site and the model host(s) listed in design.md | CSP header/meta review; CI secret scan (gitleaks) passes; browser network log in the e2e test |
| NFR-002 | Privacy / data classification | No question, answer or photo leaves the device: 0 requests carry visitor input; the only requests are the page's own files and model downloads. No analytics, cookies or local storage of questions | e2e test asserts the request list during a ritual |
| NFR-003 | Availability | Hosted on GitHub Pages; after one complete ritual the altar works with no network (REQ-011) | Manual offline test before publishing |
| NFR-004 | Performance | Reference laptop (Q-1), supported browser, empty cache: altar visible ≤ 3 s (Playwright `load` event); GPT-2 first word ≤ 60 s on first visit (incl. download, ≥ 50 Mbps) and ≤ 5 s on later visits; Gemma 4 answer complete ≤ 90 s once downloaded; medium complete ≤ 120 s | Manual timing, recorded in progress.md |
| NFR-005 | Download budget | First-visit download ≤ 2.5 GB in total; GPT-2 ≤ 300 MB; the visitor sees Gemma 4's size before consenting and GPT-2's size in its loading line; models are cached for later visits | Network panel; sizes listed in the about panel |
| NFR-006 | Cost | €0/month to run: static hosting, inference on visitors' devices, no paid APIs | Design review |
| NFR-007 | Observability | No remote telemetry (privacy). With `?debug`, load times, tokens/s and errors are written to the browser console | Manual check |
| NFR-008 | Compliance / licences | Shipped code and models use permissive licences only (MIT, Apache-2.0, BSD, ISC); Gemma 1–3 appear only as recorded outputs credited under the Gemma Terms of Use; every model's licence is shown (REQ-009) | npm licence check (CI if the founder approves the workflow change, else run locally and logged in progress.md); about panel review |
| NFR-009 | Accessibility | The core ritual meets WCAG 2.2 AA: keyboard operable, text contrast ≥ 4.5:1, focus visible, animation respects reduced motion; each answer announced once to screen readers when it completes (not per token) | axe check in e2e (0 serious/critical); keyboard walkthrough |
| NFR-010 | Cultural accuracy | Every ritual element and Spanish text matches the cited sources and is reviewed by a reader of Mexican background before publishing (copy sent by Oct 31 12:00); IF no review by 17:00 THEN publish with a visible "cultural review pending" note in the about panel; no Halloween or sugar-skull costume styling | Review notes in progress.md |
| NFR-011 | Delivery | Published before Oct 31, 23:00 Spain time; code freeze Oct 31, 18:00 Spain time | DEV post timestamp |

## Out of scope
- Live Gemma 1–3 in the browser: too large to download for a visit, and not needed to tell the
  family's story (recorded voices are honest and labelled).
- A server or any API: would break the "on your device" promise and add cost.
- Mobile-first layout: no time this version; phones may work.
- Saving or sharing rituals: would require storage of visitor input.
- Model fine-tuning, benchmarks and scientific comparison.
