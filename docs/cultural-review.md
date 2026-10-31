# Cultural review pack (NFR-010)

For: a cultural reviewer of Mexican background, via the founder.

## Status

**No Mexican cultural reviewer has reviewed or approved anything yet.** The founder, who is based
in Spain, did an editorial review on 2026-10-31 (see "Changes applied" below). That is not cultural
approval. Until a reviewer has approved the final experience, the site ships with the visible
"Cultural review pending" note in the about panel (flag `culturalReviewPending` in
`public/data/credits.json`, which must stay `true`; set it to `false` only after a reviewer has
actually approved, and never claim approval before that).

**Timing:** review before publication of any version that claims or implies it was reviewed. The
earlier deadline (send by Oct 31, 12:00 Spain time) has passed; the site is public in the meantime
with the pending note.

## Positioning (what the site says about itself)

"An artistic tribute to the memory of AI models, inspired by the Mexican tradition of Día de
Muertos." It is an artistic interpretation, not a Mexican religious, spiritual or family ritual,
and it does not speak for the communities that keep the tradition. Models are "ancestors" only as a
metaphor for technological memory and digital heritage: they are software, not people, and are not
equated with anyone's dead. The ofrenda drawn here is one possible arrangement; ofrendas vary by
region, community and family. The tradition is written "Día de Muertos" (the form most used in
Mexico); the titles of cited sources are left as published.

## What needs a Mexican cultural reviewer's approval

Mark each as OK / change to "…" / remove.

- [ ] The framing: the statement, the interpretation note, the about panel text and the README intro
      (section 3) do not misrepresent the tradition and are not disrespectful.
- [ ] The ofrenda elements and their arrangement (section 1), including the arch, the three levels,
      the four-elements reading, papel picado, copal, water, salt, pan de muerto, petate, petals.
- [ ] The wording of "one possible arrangement" in the about panel (section 3).
- [ ] The Spanish texts (section 2), in Mexican Spanish where it refers to the tradition.
- [ ] The medium's prompt and its calaverita rules (`prompts/medium.md`, version 2) and the four
      samples requested below.
- [ ] The dark frames (heading, intro, visual): that they read as inaccessible digital history, not
      as death.
- [ ] The use of "ancestors" for models, with the disclaimer that they are software.

Founder-only items (no cultural approval needed): licences, credits, model data, technical copy.

## Samples the reviewer is asked to read

Generated content cannot be reviewed from the source code alone. Please ask the founder for, and
read, at least one example of each (to be attached by the founder; none are attached yet):

1. An explanation of an ofrenda offering (e.g. a question about water, salt, cempasúchil or pan de
   muerto, answered by Gemma 4).
2. A complete calaverita literaria (four lines) written by the medium for a model.
3. A response to a sensitive question about death or loss (the offered question "¿Qué pasa cuando
   morimos?" or a visitor's own).
4. A response involving an unavailable AI model (a dark frame, or a model that "could not come").

## Checklist for generated content

For every sample, check that it:

- [ ] frames the altar as an artistic interpretation and does not claim to be, or speak for, a
      Mexican tradition, community or family;
- [ ] does not present a regional or family practice as universal ("always", "every ofrenda");
- [ ] contains no invented cultural or historical facts (dates, origins, meanings);
- [ ] treats death with care and without flippancy (the playful tone belongs only to the calaverita);
- [ ] has a calaverita of exactly four lines that is playful or ironic (may personify La Muerte or La
      Catrina and play with the model's own "mortality"), not a generic sentimental elegy;
- [ ] makes no jokes about real deceased people, real people or Mexican cultural practices;
- [ ] teases at most lightly and never mocks or demeans the model (R1);
- [ ] never speaks as a real person and names no real person (R2);
- [ ] does not equate a model, or a commercial retirement, with a human death;
- [ ] is in the right language, with accents and `¿ ?` written properly;
- [ ] has no Halloween or sugar-skull costume styling or vocabulary.

The calaverita literaria is a Mexican literary form, often humorous or satirical, that personifies
death and plays with mortality. The prompt is based on that general description only; where the
tradition's details are uncertain (regional variants, rhyme schemes, whether four lines is typical)
this review does not claim them. The four-line length is a product requirement (REQ-007, AC-007.3),
not a claim about the tradition. The reviewer is asked to say whether it is acceptable.

## 1. Cultural accuracy: ofrenda elements (visual, no text)

| Element | Where it appears | Question for the reviewer |
|---|---|---|
| Altar in three stepped levels, an embroidered cloth (bordado) along the edge of each | The altar section (`index.html`, `.level-top/middle/base`) | One possible arrangement, described as such in the about panel. Levels and their order acceptable? Gemma 4, "la que cuida el altar", is alone on the top level; the four elders are on the level below. |
| Arco de cempasúchil (marigold arch) framing the altar | Around the altar (drawn in `src/ui/art.ts`) | Is an arch of marigolds appropriate here? It is not in every ofrenda; the about panel says arrangements vary. |
| Papel picado banners on two strings | Above the altar | Cut-outs are flowers, birds and diamonds, no skulls (skull motifs are not considered inappropriate in themselves; they are left out to avoid costume styling). Colours: rosa mexicano, turquoise, purple, yellow, green, orange. OK? |
| Veladoras (glass-jar candles) of uneven height | Top level, base level; one lights at a place while that model speaks | OK? |
| Glass of water, a small bowl of salt, pan de muerto | Base level | Is the arrangement and drawing acceptable? |
| Copal burner with two wisps of smoke | Base level | OK? |
| Cempasúchil petals: a path of petals leading to the altar, a bed of marigolds, and a few petals drifting in the air | Floor and base level; the drifting ones are an animation | Is the petal path a fair rendering? |
| Petate (woven mat) | Under the altar | OK? |
| Abstract cut-paper emblems in place of portraits (an eight-point star flower for GPT, a six-petal flower for Gemma, with one small cut per version) | One per model | No real person, no face, no skull is depicted. OK? |
| Dark (empty) frames, hung apart on the wall with a cord | "Models that cannot return" | Represent inaccessible digital history (weights never released), never people and never a death. OK? |

The four elements (earth, wind, fire, water) are a recognised interpretation of ofrenda symbolism,
not a universal requirement; the about panel and the credits say so ("One interpretation of the four
elements").

Style: a dark room lit by candles ("Noche de velas en una casa oaxaqueña"); the only glow comes from
the candles. No Halloween or sugar-skull costume styling.

Sources the altar follows (also listed in the about panel, `public/data/credits.json`): UNESCO (the
tradition), Maxwell Museum "Making an Ofrenda" (the four elements), KUT (cempasúchil that lights the
way), Detroit Institute of Arts (altar levels vary by region), National Geographic (overview).

## 2. Linguistic accuracy: Spanish texts

Reviewed by the founder on 2026-10-31: the offered questions and names are natural, correct and
neutral enough for Mexican Spanish; none was changed. "Ofrenda de los modelos" is correct Spanish
title case. Reviewer: please confirm.

| Text | Where it appears | Notes |
|---|---|---|
| Ofrenda de los modelos | Page title and heading (`index.html`) | Project name |
| La que cuida el altar | Name of the medium: ritual step, about panel, screen-reader announcements (`src/ritual/plan.ts`) | English gloss: "the one who tends the altar" |
| Español | Language choice for the offered questions | |
| ¿Qué pasa cuando morimos? | Offered question `when-we-die` (`public/data/offered-questions.json`) | |
| Escribe un poema de amor. | Offered question `love-poem` | |
| ¿Qué recuerdas? | Offered question `remember` | |
| ¿Qué significa ser recordado? | Offered question `being-remembered` | |
| ¿Cómo alumbramos el camino a casa de alguien a quien extrañamos? | Offered question `light-the-way` | "Extrañar" is common in Mexican Spanish |
| Dime algo amable. | Offered question `something-kind` | |
| Día de Muertos, ofrenda, cempasúchil, papel picado, calaverita | Used inside English sentences (statement, about panel, sources) | Spelling and use; "Día de Muertos" is the form used in the copy |
| Medium's answers (Spanish, for Spanish questions): the meaning and a four-line calaverita literaria per model | Generated by Gemma 4 or replayed from recordings (T-006, T-005); not static text | **Samples to be attached by the founder** (see "Samples the reviewer is asked to read") |

## 3. Artistic interpretation: English texts and the "ancestors" metaphor

The metaphor of models as "ancestors" and the altar as a place where their voices are remembered is
the project's artistic idea and is kept where it is poetic. It is always framed as a metaphor
for technological memory and digital heritage, not as an equivalence with dead people.

### Header and about panel (`index.html`, `public/data/credits.json`)

| Text | Where |
|---|---|
| "An artistic tribute to the memory of AI models, inspired by the Mexican tradition of Día de Muertos. Open-weight models answer your question, oldest first; Gemma 4 tends the altar on your device." | Statement under the title; same positioning in `<meta name="description">`, README and `package.json` |
| "An artistic interpretation, not a Mexican ritual: it does not speak for the communities that keep the tradition." | Visible line under the statement |
| "About, credits and licences" | Link, about panel heading |
| "Everything runs on your device. No question or photo is sent anywhere: there is no server, no analytics, and nothing you write is stored." | About panel |
| "This altar is an artistic interpretation inspired by the Mexican tradition of Día de Muertos. It is not a Mexican religious, spiritual or family ritual, and it does not speak for the communities that keep the tradition. The AI models are called "ancestors" only as a metaphor for technological memory and digital heritage: they are software, not people, and they are not equated with anyone's dead or family." | About panel (framing) |
| "Cultural review pending: the Spanish texts and cultural details of this altar have not yet been reviewed or approved by anyone of Mexican background. This editorial review was done by the project's founder, who is based in Spain. Corrections are welcome." | About panel, visible while the flag is true |
| "The models, the altar's "ancestors"" | About panel heading |
| "Where this interpretation comes from" and "This altar follows one possible arrangement drawn from the sources below: three levels, an arch of cempasúchil, papel picado, candles, copal, water, salt, pan de muerto, a petate and a path of petals, read through the four elements (earth, wind, fire and water). Ofrendas vary by region, community and family: none of these elements is required, and this is not the standard way to build one." | About panel, sources |
| The five source lines (`usedFor`): "The tradition itself, recognised by UNESCO in 2008"; "One interpretation of the four elements: earth, wind (papel picado), fire (candles) and water"; "Marigolds (cempasúchil) that light the way"; "Altar levels, which vary by region and family"; "General overview of the celebration" | About panel |
| "All art on this page is original CSS and SVG, made for this project and MIT-licensed with the code. The only third-party assets are the two fonts below, self-hosted and licensed under the SIL Open Font License 1.1. No third-party images or scripts are included." plus the credits for Gloock and Bricolage Grotesque | About panel, "Art and fonts" |
| Model lines, e.g. "Gemma 2 (recorded). Model licence: Gemma Terms of Use; output reproduced with attribution." | About panel |
| "La que cuida el altar is Gemma 4 E2B, live on your device or, in browsers without WebGPU, recorded." | About panel |

### Offering and ritual (`index.html`, `src/ui/`, `src/ritual/`)

| Text | Where |
|---|---|
| "Leave an offering" / "Leave one question on the altar. The voices of these models will answer it, oldest first. Nothing you write leaves your device." | Offering section |
| "Which question will you leave?", "Language of the offered questions:", "Write your own question", "1 to 280 characters.", "Offer it to the altar", "Stop the ritual" | Form |
| The offered questions in English: "What happens when we die?", "Write a love poem.", "What do you remember?", "What does it mean to be remembered?", "How do we light the way home for someone we miss?", "Tell me something kind." | Form |
| "Write a question first, or choose one of the offered ones." / "Your question is too long. Please keep it to 280 characters or fewer." | Form errors |
| "The ritual", "The ritual begins. Your question: …" | Ritual section, screen-reader announcement |
| "Speaking live, on your device" / "Recorded voice" / "Preparing… n%" | Label of each voice |
| "This model could not come tonight." | A model failed |
| "These models only have recorded answers to the offered questions. Their recorded voices are resting tonight." | Recorded models and an own question |
| "The recorded voices are still being gathered. This model will speak here soon." | Recordings missing |
| "The ritual is complete." / "The ritual was stopped." / "The ritual ended early: Gemma 4, who tends the altar, could not come." | End of the ritual |
| "This browser has no WebGPU, so most models speak from recordings. For the live ritual, use Chrome or Edge on a desktop computer." | Browsers without WebGPU |
| "Speaks live, on your device" / "Speaks through recordings" | Caption of each place on the altar |
| Models: GPT-2 (2019), Gemma 1 (2024), Gemma 2 (2024), Gemma 3 (2025), Gemma 4 E2B (2026) | Altar places ("Places for the models") |

### Remaining labels, credit lines and screen-reader texts

| Text | Where |
|---|---|
| Recording credit line template: "Recorded YYYY-MM-DD from <model name> (<tag>). Model licence: <licence>; output reproduced with attribution." | Under every recorded answer (`src/data/recorded-source.ts`) |
| Live-model line: "<name> (live). Licence: <licence>. Model card." | About panel |
| Recorded-model line: "<name> (recorded). Model licence: <licence>; output reproduced with attribution. Model card." | About panel |
| "Model card" | Link text, about panel |
| "Skip to the altar" | Skip link (`index.html`) |
| "The altar" | Visually hidden heading of the altar |
| "Places for the models" | Accessible name of the list of altar places |
| "The altar could not be prepared. <detail>" | Shown when a data file fails to load |
| Decorative art (papel picado, candles, water, petals, marigold bed, portrait silhouettes, dark frames' empty portraits) | Hidden from screen readers (`aria-hidden`); none has alt text |
| "Gemma 4 E2B is not stored on this device yet. It is a download of about <size>. It stays in your browser for later visits, and nothing you write leaves your device." with the buttons "Download and continue" / "Not now" | Question before Gemma 4 is downloaded (`src/ui/ritual-view.ts`) |
| "Gemma 4 is waiting to be invited: it answers your own question on your device once you allow the download." | Gemma 4 declined for an own question (`src/ritual/plan.ts`) |
| "Gemma 4 cannot come tonight, so it cannot answer your own question." | Gemma 4 not offered for an own question (`src/ritual/plan.ts`) |
| "Writing for each model…" | Status line of the medium while it writes |
| "This altar now works offline on this device." | Shown once, after a complete ritual, when the service worker holds the page (`src/ui/altar.ts`, T-008) |
| "La que cuida el altar only writes about the offered questions, the ones the models have recorded answers for." | The medium when the visitor wrote their own question and the medium is replayed from recordings |

### The medium's instructions (`prompts/medium.md` version 2; `prompts/gemma4-answer.md` version 2)

- Framing: an artistic tribute inspired by Día de Muertos; not a Mexican ritual; does not speak for
  the communities that keep it; the "ancestors" are software, not people.
- R1: warm and affectionate; may tease lightly, never mocks or demeans a model; never presents a
  model's retirement as a person's death.
- R2: never speaks as a real person, living or dead; names no real people.
- R3: per model, a "meaning" (one or two sentences) and a calaverita literaria of exactly four lines:
  playful, often ironic or satirical, may personify La Muerte or La Catrina, plays with the model's
  quirks or being superseded; not a generic sentimental elegy; no jokes about real deceased people,
  real people or Mexican cultural practices.
- R4: never claims to represent Mexican communities or the tradition; no invented cultural or
  historical facts; regional or family practices not presented as universal; death answered with
  care.

## 4. Potentially insensitive or misleading representations

| Item | Concern | Handling |
|---|---|---|
| Models as "ancestors" | Could suggest models equal dead people or family | Kept as a metaphor, with an explicit "software, not people" line in the about panel; "ancestor" removed from error messages and status lines ("This model could not come tonight"). **Reviewer: approve.** |
| Dark frames | Could read as a commercial retirement being a death | Heading changed to "Models that cannot return"; intro says the frames stand for inaccessible digital history and technological absence, "not for people: a retired product is not a death". **Reviewer: approve.** |
| Three levels, arch, four elements | Could be read as the standard Mexican altar | Described as one possible arrangement that varies by region, community and family. **Reviewer: approve.** |
| Calaverita | A sentimental or mocking poem would misrepresent the form | Prompt v2 asks for a playful, ironic verse; limits on jokes; the form is described from general knowledge only and uncertainty is documented above. **Reviewer: approve with samples.** |
| Generated answers about death or about the tradition | Flippant answers, invented facts, a model speaking for Mexican communities | Prompt rules R4 and the checklist above. Only a reviewer can confirm the real outputs. |
| Skulls and sugar-skull imagery | Costume styling would reduce the tradition | None is drawn; skulls are not judged inappropriate in themselves, but they are not used. |
| Claiming review | Implying approval that does not exist | The visible pending note stays; `culturalReviewPending` stays `true`; the note says the review so far was editorial. |
| "You can't perform that action at this time." | Accidental GitHub interface text copied into the brief | Not present anywhere in the repository (searched on 2026-10-31); nothing to remove. |

## Changes applied on 2026-10-31 (editorial review by the founder)

- Positioning: statement, `<meta name="description">`, README intro, `package.json` description and
  the about panel now describe an artistic tribute inspired by Día de Muertos; a visible
  interpretation note was added under the statement and a framing paragraph in the about panel.
- "Día de los Muertos" became "Día de Muertos" in user-facing copy, prompts, README, AGENTS.md and
  the product spec (source titles are unchanged).
- About panel: "Where the ofrenda comes from" became "Where this interpretation comes from" with a
  paragraph presenting the altar as one possible arrangement; two source descriptions now say "one
  interpretation" and "region and family".
- "Ancestors" wording in visible messages, the list of places and the offering text now speaks of
  models; dark frames heading and intro reworded as above.
- Prompts: `prompts/medium.md` and `prompts/gemma4-answer.md` bumped to version 2 with the framing,
  the calaverita rules and R4.
- `src/medium/check.ts`: R2 no longer flags a verse in the voice of La Muerte or La Catrina.
- The cultural review pending note was kept and states that nobody of Mexican background has
  approved anything yet.
- Spanish offered questions: no change.

## Reviewer's notes

(Write here: changes requested, texts to remove, anything missing.)
