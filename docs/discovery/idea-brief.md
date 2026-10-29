# Idea brief: Ofrenda de los Modelos

- Status: Go (conditional on the two spikes in §10)
- Last updated: 2026-10-29
- Context: entry for DEV's "Hacktoberfest Open-Source AI Challenge, Week 4: Ghost in the
  Machine". Deadline **Oct 31, 11:59 PM PDT = Sat Nov 1, 07:59 Spain time**. Partner prize
  "Best Use of Gemma 4". This is a challenge entry, not a business: §2 and §5 are replaced by
  audience and judging, and the scorecard uses the judging criteria.
- One-liner: An altar, open in any browser, where open-weight AI models come home for Día de
  los Muertos. You leave a question; the ancestors answer, from GPT-2 to Gemma 4, and Gemma 4,
  running on your own device, tends the altar. Closed models can't come: their frames stay dark.

## 1. The story (why this matters)
AI models die. When a closed model is retired it is gone: nobody can ask it anything again.
In 2025 about two hundred people held a real funeral for a retired closed model in San
Francisco, because there was nothing else they could do. An open-weight model can't die that
way. Its weights are something anyone can keep, and bring home once a year.

Día de los Muertos is about exactly that: the dead come back if someone remembers them and
sets a place for them. Here the ancestors are the open models, so *openness is the subject of
the project, not just its tool*. Title and thesis: **"The only AI that can come back from the
dead."**

The Gemma 4 beat: Gemma 1–3 came with Google's own terms of use. Gemma 4 is the first Gemma
under Apache 2.0, **the first Gemma that can't be taken away**. The youngest of the family was
born freer than its ancestors, and it is the one that tends the altar.

Framing to stay honest: Gemma 1–3, GPT-2 and Pythia aren't "dead", they're on Hugging Face.
They are *ancestors who have passed on* (superseded), visited at the altar. The truly lost ones
are the closed models in the dark frames.

## 2. Audience and judging
| Who | What they want | How the project answers |
|---|---|---|
| Judges (writing weighted most) | A story, a clear "why open", theme fit, creativity, solid build | The thesis; one link they can open; honest limits |
| Readers | Delight + something to try | Static page, no install; 60-second video as fallback |
| Gemma 4 prize | Something only Gemma 4 does here | On-device in the browser, Apache 2.0 beat, 140+ languages, vision offering (stretch) |

## 3. Solution concept (MVP)
**The ritual (~2 minutes):**
1. **The altar loads** (a loading ritual while Gemma 4 downloads once, ~1.5–2 GB, then cached):
   levels of portraits, cempasúchil petals, papel picado, candles, a glass of water.
2. **Leave an offering:** one question, in any language.
3. **The ancestors speak, oldest first:**
   - **GPT-2 (2019), live** in the browser. Its candle flickers as it streams. Under its words
     float the **ghost words**, the words it almost said (top-k from its logits).
   - **The middle generations, "recorded voices"** (labelled as such): answers recorded offline
     on the builder's laptop from Gemma 1, Gemma 2, Gemma 3 (and Pythia) for ~6 offered
     questions. A free-form question shows "these ancestors only answer the questions they
     left for us": an honest, fitting limit.
   - **Gemma 4 E2B, live, on your device.**
4. **La que cuida el altar** (Gemma 4) speaks last, in the visitor's language: what each
   ancestor was trying to say, kindly, and a **calaverita literaria** for each (the
   traditional short, affectionate rhyming epitaph).
5. **The dark frames:** retired closed models with sourced dates (Claude 3 Sonnet, PaLM API,
   GPT-4o in ChatGPT). "Its weights were never released. It cannot come home."
6. **Stretch: the photo offering** (Gemma 4 vision): photograph a real offering (a marigold,
   pan de muerto, a candle) and Gemma 4 places it on the altar with a line about it. Objects
   only; never a person.

**Cut from the MVP** (devil's advocate): live Gemma 1–3n, the llama.cpp server, EmbeddingGemma
resemblance, hover-to-follow ghost paths, printable card (a screenshot is enough).

## 4. Market and competition
Details and links in research-notes.md.
| Existing | What it is | Difference |
|---|---|---|
| The Model Graveyard (Product Hunt) | Deprecation tracker | Lists dead models; nothing runs |
| Museum of Models | Archive of deprecated models' outputs, mostly images | Archived outputs, closed models |
| Essays on AI model cemeteries / lost model history | Writing | No working tool |
| Claude 3 Sonnet funeral (SF, ~200 people) | A real event | The best opening anecdote |
| Other entries with local Gemma 4 (memory and ghost chatbots) | Memory / ghost chatbots | Ours is about the models themselves and the open-vs-closed argument; lead with that |

No runnable "ofrenda" of live open models found (one quick search; not proof).

## 5. Value (instead of a business model)
- Goals: overall placement; the Gemma 4 prize ($100–200, to verify); a post shared around 1–2 Nov.
- After: an open-source repo where an ancestor is one manifest entry; re-run every 1 November.
- Cost to run: €0. Static hosting (GitHub Pages); inference on the visitor's device.

## 6. Technical feasibility
- **Architecture (static, browser-first):**
  - One static page (TypeScript, Vite), hosted on GitHub Pages.
  - transformers.js + WebGPU: GPT-2 (tiny; logits → ghost words) and Gemma 4 E2B (medium).
  - `recorded-voices.json`: answers from Gemma 1/2/3 (+ Pythia) to ~6 questions, generated
    offline with Ollama on the laptop; each entry records model, tag, licence, date, settings.
  - `dark-frames.json`: retired closed models with sourced dates.
  - Orchestration is plain code, a fixed order; Gemma 4 does the language and judgement.
  - Fallback path in the README: the same page against Ollama (`gemma4:e2b`) for browsers
    without WebGPU.
- **Unknowns and tests:**
  - U-1 Gemma 4 E2B in the browser on the target laptop: loads, and answers in < ~30 s
    (spike, §10). Safari/Firefox WebGPU is patchy: say "Chrome/Edge recommended".
  - U-2 E2B writes usable calaveritas in Mexican Spanish (spike, §10).
  - U-3 Gemma 1–3 tags still pull in Ollama for the recordings (verify each tag; if one fails,
    drop that ancestor).
- **Licences (permissive only):** GPT-2 MIT, Pythia Apache-2.0, Gemma 4 Apache-2.0; Gemma 1–3
  under the Gemma Terms of Use (recorded outputs only, credited). No Llama 2 / OPT.
- **Data and privacy:** no accounts, no server; the question and photo never leave the device.
- **Effort (estimate):** spikes 2 h; altar page + GPT-2 live + ghost words 4 h; recordings 1 h;
  medium + calaveritas 2 h; dark frames 1 h; post 4 h; video 1 h. Total ~15 h; vision +2 h.

## 7. Personal fit
TypeScript home ground. New: transformers.js/WebGPU, logits, narrative writing. Portfolio
value high. Time is the constraint (~12–15 h available).

## 8. Risks and pre-mortem
Pre-mortem "Nov 3, it didn't place": scope drowned the post; judges couldn't run it; the Gemma
prize went to a Gemma 4-native entry; the Spanish verse was weak; the cultural tone misfired.
| Risk | Likelihood | Impact | Mitigation / test |
|---|---|---|---|
| Scope eats the post (writing is weighted most) | High | High | Post drafted by Oct 30 night; code freeze Oct 31 18:00 Spain time |
| Judges can't run it | Medium | High | Static link, no install; video fallback; loading ritual |
| Gemma 4 case too generic | Medium | High | On-device browser + Apache 2.0 beat + any-language + vision stretch |
| Weak Spanish verse from E2B | Medium | Medium | Spike first; prompt with examples; E4B or 26B via Ollama for the video if needed |
| Cultural misstep (builder in Spain) | Medium | High | "La que cuida el altar", not "curandera"; real elements, no sugar-skull/Halloween styling; cite UNESCO and museum sources; say who I am and why (Spain's Todos los Santos as an honest bridge); one Mexican reader reviews the copy |
| "Open" overclaimed | Medium | Medium | Say "open-weight"; Gemma 1–3 terms vs Gemma 4 Apache 2.0 stated precisely |
| Logic picked apart ("Gemma 2 isn't dead") | Medium | Medium | "Ancestors who have passed on"; the dead are the closed ones |
| Unverified rules/dates | Medium | Medium | Re-read the Week 4 page; cite only official retirement dates |

## 9. Scorecard (challenge criteria; weights from the judging order)
| Criterion | Weight | Score (1–5) | Why |
|---|---|---|---|
| Writing quality | 35% | 5 | Thesis = title; ritual arc; the funeral anecdote; the Apache 2.0 beat |
| Relevance to prompt and theme | 25% | 5 | Día de los Muertos; open weights are the subject |
| Creativity | 20% | 4 | Crowded ghost/memory field, but no live open-model altar found |
| Technical execution | 20% | 3.5 | Browser WebGPU + logits is real work; risk U-1 |
| **Weighted (max 5)** | | **4.5** | After research and devil's advocate |
| Gemma 4 prize fit | separate | 4 (5 with vision) | On-device, Apache 2.0, multilingual; vision makes it Gemma 4-specific |

## 10. Verdict and next steps
- **Verdict: Go**, with the browser-first hybrid MVP in §3, if the two spikes pass.
- **Spikes (today, ~2 h):**
  | Hypothesis | Experiment | Success signal | Time |
  |---|---|---|---|
  | E2B writes usable calaveritas | 5 prompts to `gemma4:e2b` (Ollama) or AI Studio | ≥ 2 of 5 usable after prompt fixes | 30 min |
  | E2B runs in the browser on my laptop | transformers.js Gemma 4 sample, WebGPU | Loads; answer < ~30 s | 60 min |
  | GPT-2 logits in the browser | transformers.js GPT-2, top-k per token | Ghost words render | 30 min |
- **Plan (Spain time):**
  - Thu Oct 29 evening: spikes; post outline.
  - Fri Oct 30: altar page, GPT-2 live + ghost words, recordings, medium; **post draft at night**.
  - Sat Oct 31: dark frames, polish; vision offering only if the core works by morning; video;
    cultural review; **code freeze 18:00; publish by 23:00** (hard deadline Sun Nov 1, 07:59).
- **Kill / fallback criteria:**
  - E2B fails the verse test: medium on Gemma 4 E4B/26B via Ollama, demo by video.
  - No browser inference by Oct 30 18:00: ship the Ollama version + video; spend the rest on the post.
  - No end-to-end demo by Oct 31 12:00: freeze code, write.
  - No Mexican reviewer reachable: tone down the ritual framing, keep "altar", cite sources.

## Open questions
- [ ] Q-1: Laptop (RAM, Apple Silicon or GPU, browser) — decides E2B vs E4B and the browser path.
- [ ] Q-2: Exact Gemma category prize and rules on the Week 4 page (verify).
- [ ] Q-3: Someone of Mexican background to read the copy.
- [ ] Q-4: DevRelay: what it is; whether to record this build session.

## Sources
See research-notes.md.
