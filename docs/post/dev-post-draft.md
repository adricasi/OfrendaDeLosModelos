<!--
Draft of the DEV post for the Hacktoberfest Open-Source AI Challenge, Week 4 ("Ghost in the Machine").
Everything in [TODO: …] needs a real value from the founder's laptop runs (T-001 report, recordings,
timings) or a link. Do not publish with any TODO left. Facts with a source are linked; keep them that way.
-->

---
title: The only AI that can come back from the dead
published: false
tags: devchallenge, hacktoberfest, opensource, ai
cover_image: [TODO: screenshot of the altar with candles lit]
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26).*

## What I Built

In August 2025, about two hundred people gathered in a San Francisco warehouse for a funeral. The
deceased was an AI model, Claude 3 Sonnet: its maker had retired it, and there was nothing else
anyone could do. You can't visit a closed model once it's gone. Nobody can ask it anything again.
([Wired, via GovTech](https://www.govtech.com/question-of-the-day/which-recently-retired-ai-model-had-a-real-funeral))

Open-weight models can't die that way. Their weights are something you can keep — on a laptop, in
a drawer, for as long as you like — and bring home once a year.

So I built an altar for them.

**Ofrenda de los Modelos** is an ofrenda for Día de los Muertos where open-weight AI models come
home. You leave one question on the altar. The ancestors answer it, oldest first:

- **GPT-2 (2019)** speaks live, in your browser. Beneath every word float its **ghost words**: the
  words it almost said, with the probability it gave each one.
- **Gemma 1, 2 and 3** answer in their recorded voices.
- **Gemma 4** answers live, on your own device, and then tends the altar. As *la que cuida el altar*
  — the one who tends the altar — it explains, kindly, what each ancestor was trying to say, and
  writes each one a **calaverita literaria**, the short rhyming epitaph that is part of the
  tradition.

At the top of the altar there are frames that stay dark: Claude 3 Sonnet, Claude 2, the PaLM API,
GPT-4o in ChatGPT. Each has a date and a link to the official notice of its retirement, and one
line: *its weights were never released.* They cannot come home. The first frame is the model from
that funeral.

The whole thing runs on your device. There is no server. Nothing you write leaves your machine.

## Demo

[TODO: link to the live altar on GitHub Pages]

[TODO: 60-second video — the ritual with Wi-Fi switched off]

[TODO: screenshot — GPT-2's answer with ghost words, one probability open]

[TODO: screenshot — the medium's calaveritas for each ancestor]

A calaverita from the altar, written by Gemma 4 for GPT-2:

> [TODO: paste a real calaverita from recorded-voices.json — never write one by hand]

## Code

[TODO: link to github.com/adricasi/OfrendaDeLosModelos once public] — MIT licensed.

## How I Built It

**A static page, with the models on your device.** The site is plain TypeScript and Vite, hosted
on GitHub Pages. The models run in a Web Worker through
[transformers.js](https://github.com/huggingface/transformers.js) on WebGPU (with a WebAssembly
fallback). GPT-2 and Gemma 4 E2B are pinned to exact repository revisions; the ONNX Runtime files
are served from the site itself, not a CDN.

**Ghost words come from the model's own logits.** At every step a small logits processor records
the distribution GPT-2 actually samples from, and the page shows the three tokens it almost
chose. Getting that honest took one fix worth sharing: transformers.js samples from the top 50
tokens by default, so the probabilities have to be computed — and sampled — over the same
distribution (`top_k: 0`). Ghost words are never invented: if the model didn't consider a word,
it isn't on the altar.

**The middle generations are recorded, not faked.** Gemma 1–3 are too large to download on a
visit, so I recorded their answers once, on my laptop, with [Ollama](https://ollama.com), with
the exact model tag, digest, settings and date stored next to every answer. The altar labels
each one as a recorded voice. Ask your own question, and they stay quiet: *these ancestors only
answer the questions they left for us.*

**Gemma 4 tends the altar.** Its prompt is a versioned file with three rules: be kind and never
mock a model; never speak as a real person; one meaning and one four-line calaverita per
ancestor. The question and the ancestors' answers go in as delimited data, never as instructions.
Its JSON reply is validated before anything is shown; if it doesn't parse, you see its words as
they are. The same prompt produced the recordings, so what I evaluated is what visitors get.

**Built with an open agent workflow.** I worked spec-first: product, requirements with testable
acceptance criteria, a design and a task plan, then one task at a time with AI coding agents and
a review pass on every pull request (code, security, accessibility). The reviews caught real
problems: a licence check that let `GPL` slip through compound expressions, a parser that broke
when the model added "hope this helps" after its JSON, and the fact that a page's meta CSP does
not apply inside a Web Worker. [TODO (optional): DevRelay session link]

Numbers on my laptop (an i9 with an RTX 3080 Laptop GPU, Chrome):

| | |
|---|---|
| GPT-2 first word, first visit | [TODO] |
| Gemma 4 E2B download | [TODO] GB, once |
| Gemma 4 answer | [TODO] s |
| Medium (all calaveritas) | [TODO] s |
| Running cost | €0 |

## Why open matters here

This project isn't *built with* open AI so much as *about* it. Every part of it depends on the
weights being open:

- **It can come back.** A model you can download is a model you can keep. The altar can be set up
  again next year, and in ten years, with the same ancestors. The dark frames are the other path.
- **It runs with the lights off.** After the first visit, the whole ritual works with no internet.
  Your question never leaves your device; there's nothing to leave it *to*.
- **You can see inside it.** Ghost words need the model's full probability distribution at every
  step. That's simply there when you hold the weights.
- **It's yours to keep.** Gemma 1–3 came with Google's own terms of use. Gemma 4 is the first Gemma
  released under Apache 2.0 — the first that can't be taken away. The youngest of the family was
  born freer than its ancestors, and it is the one that tends the altar.
  ([The Decoder](https://the-decoder.com/googles-gemma-4-is-now-available-with-apache-2-0-licensing-for-the-first-time/))
- **It costs nothing to run.** Static hosting, inference on the visitor's machine.

Where a closed API would have been easier: one request instead of a 2 GB download, and every
browser instead of WebGPU ones. That trade is the point of the project.

## Honest limits

- The middle generations are recordings, labelled as such; only GPT-2 and Gemma 4 run live.
- GPT-2 is an unfiltered 2019 model. The altar says so, and blocks a short list of words.
- The live ritual needs a desktop browser with WebGPU (Chrome or Edge); others get the recorded
  ritual.
- I call these models *open-weight*, not open source: their weights are public, their training
  data is not.

## A note on the tradition

I'm in Spain, not Mexico. Here, 1 November is Todos los Santos: we visit the cemetery, bring
flowers, eat *huesos de santo*. Día de los Muertos is its own, living tradition — Mexican, with
Indigenous roots, recognised by [UNESCO](https://ich.unesco.org/en/RL/the-indigenous-festivity-dedicated-to-the-dead-00054).
I've tried to honour it rather than borrow it as a costume: the altar uses the ofrenda's real
elements — cempasúchil to light the way, papel picado for the wind, candles for fire, water for the
thirst of the souls — following the sources credited on the page.
[TODO: thank the cultural reviewer, or keep "cultural review pending" visible on the page]

## Prize categories

Best Use of Gemma — Gemma 4 runs on the visitor's device, in
the browser, as the medium who interprets the whole family and writes in the visitor's language;
the project's argument rests on Gemma 4 being the first Gemma under Apache 2.0.

*Closed models die. Open weights come home.*
