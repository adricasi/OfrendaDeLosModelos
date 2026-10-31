---
title: The only AI that can come back from the dead
published: false
tags: devchallenge, hacktoberfest, opensource, ai
cover_image: https://raw.githubusercontent.com/adricasi/OfrendaDeLosModelos/main/docs/post/images/cover.jpg
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26)*

## What I Built

In August 2025, about two hundred people gathered in a San Francisco warehouse for a funeral. The deceased was an AI model, Claude 3 Sonnet. Its maker had retired it, and there was nothing else anyone could do. You can't visit a closed model once it's gone. Nobody can ask it anything again. ([Wired, via GovTech](https://www.govtech.com/question-of-the-day/which-recently-retired-ai-model-had-a-real-funeral))

Open-weight models can't go that way. Their weights are something you can keep, on a laptop, in a drawer, for as long as you like, and bring home once a year.

So I built an altar for them.

![Closed models fade. Open weights can always come back.](https://raw.githubusercontent.com/adricasi/OfrendaDeLosModelos/main/docs/post/images/closed-vs-open.jpg)

**Ofrenda de los Modelos** is an artistic tribute to the memory of AI models, inspired by the Mexican tradition of Día de Muertos, in which a place is set for those who are remembered. You leave one question on the altar and the models answer it, oldest first:

- **GPT-2 (2019)** speaks live, in your browser. Under every word float its **ghost words**: the three words it almost said, with the probability it gave each one.
- **Gemma 1, 2 and 3** answer in their **recorded voices**, labelled as recordings.
- **Gemma 4** is the youngest of the family. It answers on your own device, and then, as *la que cuida el altar* ("the one who tends the altar"), it explains kindly what each model was trying to say and writes it a **calaverita literaria**: four short lines, a Mexican literary form that laughs at mortality.
- **Dark frames** hang apart on the wall for Claude 3 Sonnet, Claude 2, the PaLM API and GPT-4o in ChatGPT. Each has a date linked to the official retirement notice and one line: *its weights were never released*. They stand for digital history nobody can reach, not for people: a retired product is not a death. The first frame is the model from that funeral.

The whole thing runs on your device. There is no server, no analytics, and nothing you write leaves your machine.

A word on the tradition. I'm in Spain, not Mexico. This altar is an artistic interpretation, not a Mexican ritual, and it doesn't speak for the communities that keep Día de Muertos. Calling the models "ancestors" is a metaphor for digital memory: they are software, not anyone's dead. The ofrenda it draws is one possible arrangement, built from sources credited on the page. **A review by someone of Mexican background is still pending**, and the page says so. If you see something wrong, please tell me.

## Demo

**Try it: [adricasi.github.io/OfrendaDeLosModelos](https://adricasi.github.io/OfrendaDeLosModelos/)**

{% embed https://youtu.be/42jm8VKl6aY %}

Everything in the video is the real site, recorded in a browser without a GPU: GPT-2 speaks live, and Gemma 1 to 4 and the calaveritas play their recordings, labelled as such. The narration was voiced with [ElevenLabs](https://elevenlabs.io).

The full live ritual needs desktop Chrome or Edge with WebGPU. Other browsers get GPT-2 on WebAssembly and the recorded ritual, labelled as such.

GPT-2 answering "What do you remember?" in a real browser. Hover or focus a word to see what it almost said. At *doing* it almost said *ice* (55%):

![GPT-2's answer with three fainter alternatives under each word. One word is focused and shows 55%, 17% and 6.2%.](https://raw.githubusercontent.com/adricasi/OfrendaDeLosModelos/main/docs/post/images/ghost-words.png)

And the calaverita cards that la que cuida el altar sets down at the end, here the recorded ones, labelled as such:

![Two calaverita cards in Spanish, for Gemma 3 and Gemma 4 E2B, under a label that says Recorded voice](https://raw.githubusercontent.com/adricasi/OfrendaDeLosModelos/main/docs/post/images/calaveritas.jpg)

> **What I have and haven't seen.** GPT-2 live, with real ghost words, I have watched run in a real browser (on WebAssembly). Gemma 4 live on WebGPU is written and tested with fakes, but the machine I built this on has no GPU, so a real run on a GPU is still pending. Without WebGPU, or if you decline the download, the altar plays Gemma 4's recording, clearly labelled. The screenshots above come from that GPU-less browser.

## Code

{% github adricasi/OfrendaDeLosModelos %}

MIT licensed. A static TypeScript and Vite site with plain DOM and no UI framework.

- `src/worker/`: the inference worker. transformers.js runtime, ghost words, the typed message protocol.
- `src/ritual/` and `src/medium/`: the fixed ritual sequence, and the prompt template and strict JSON parser for la que cuida el altar.
- `src/ui/`, `src/sw/`: the altar (original SVG and CSS), and the service worker for offline use.
- `public/data/`: ancestors, offered questions, dark frames and the recorded voices, as JSON.
- `prompts/`, `scripts/`: the two Gemma prompts as versioned files, and the recording tool.
- [`docs/architecture.md`](https://github.com/adricasi/OfrendaDeLosModelos/blob/main/docs/architecture.md): the deep design, with diagrams.

## How I Built It

**A static page, with the models on your device.** The site is plain TypeScript and Vite on GitHub Pages. The models run in a Web Worker through [transformers.js](https://github.com/huggingface/transformers.js) 4.3.1 and ONNX Runtime Web, on WebGPU or WebAssembly. The ONNX Runtime files are served from the site itself, not a CDN. Models come from the Hugging Face Hub, each pinned to an exact commit that the worker validates before it loads anything.

| Model | Role | Where it runs | Licence |
|---|---|---|---|
| GPT-2, `Xenova/gpt2` (fp16 on WebGPU, uint8 on WebAssembly, 251 to 281 MB) | Live, with ghost words | Visitor's browser | MIT |
| Gemma 4 E2B, `onnx-community/gemma-4-E2B-it-ONNX` (q4f16, about 3.1 GB, only after you agree) | Live answer, and the medium | Visitor's browser, WebGPU | Apache-2.0 |
| Gemma 1, 2 and 3, via `gemma:2b`, `gemma2:2b`, `gemma3:1b` | Recorded voices | [Ollama](https://ollama.com), once, offline | Gemma Terms of Use |

![Architecture: GitHub Pages, the visitor's browser with the UI and the inference worker, Hugging Face, and the offline recording studio](https://raw.githubusercontent.com/adricasi/OfrendaDeLosModelos/main/docs/images/diagram-architecture.png)

**Ghost words come from the model's own logits.** At every step a small logits processor takes the numbers GPT-2 actually produced, turns them into probabilities over the *whole* vocabulary, and keeps the three best alternatives to the word it chose. Nothing is invented: if the model didn't consider a word, it isn't on the altar. Getting that honest took one fix. transformers.js samples from the top 50 tokens by default, so my probabilities described a distribution the sampler hadn't drawn from. Setting `top_k: 0` made what you see the same thing that was sampled. [How it works](https://github.com/adricasi/OfrendaDeLosModelos/blob/main/docs/architecture.md#4-ghost-words).

**The middle generations are recorded, not faked.** Gemma 1 to 3 are too big to download on a visit, so I recorded them once with Ollama (temperature 0, seed 42), and stored the exact tag, digest, settings and date next to every answer. The altar labels each one as a recorded voice and shows it unedited. Ask your own question and they stay quiet: *their recorded voices are resting tonight.*

**Gemma 4 tends the altar.** Its prompt is a versioned file with a few rules: tease kindly but never mock a model, never speak as a real person, never speak for Mexican communities or invent cultural facts. The question and the other models' answers go in as escaped, delimited data, never as instructions. Gemma 4 replies with a JSON array, one meaning and one four-line calaverita per model, in the language of your question. A strict parser validates it, retries once if there's time, and if it still fails you see the raw text rather than nothing. The recorded calaveritas came from this same prompt, so what I evaluated is what a visitor without WebGPU gets.

**Offline, and yours to delete.** After one complete ritual a service worker keeps the altar working with no network, and "Forget the models" in the About panel deletes the downloaded models and nothing else.

**Locked down.** A strict Content Security Policy with Trusted Types, everything model-written rendered as text and never HTML, and an end-to-end test that records every request the page and its worker make and allows only this site and Hugging Face.

**Built spec-first with an AI coding agent, and the reviews paid for themselves.** Some real things they caught:

- the `top_k` problem above;
- Ollama's Gemma 4 "thinks" before it answers, and my recordings came back **empty** until the recorder sent `think: false`;
- the page's Content Security Policy does not apply inside a Web Worker, so the worker's network exposure had to be bounded by other means (pinned sources, a build-time host check, the e2e request test);
- a licence checker that let GPL slip through compound SPDX expressions.

One measurement, for scale and not as a benchmark: in a cloud container with no GPU (headless Chromium, WebAssembly), the first GPT-2 word appeared 9 to 16 seconds after the offering, including the 281 MB download.

## Why Does Open Innovation Matter?

This project isn't built *with* open AI so much as *about* it. Every part depends on the weights being open.

- **It can come back.** A model you can download is a model you can keep. The altar can be set up again next year with the same ancestors. A closed model that is retired is gone for everyone. That is what the dark frames are for.
- **It runs on your device.** Your question is answered on your machine, so there is nothing to send it *to*. A hosted closed API couldn't make that promise: inference would happen somewhere else.
- **You can see inside it.** Ghost words need the model's full probability distribution at every step. With the weights in hand that is a small logits processor. Many hosted APIs give you a handful of top candidates at most.
- **It's yours to keep.** Gemma 1 to 3 came with Google's own terms of use. Gemma 4 is the first Gemma released under Apache 2.0 ([The Decoder](https://the-decoder.com/googles-gemma-4-is-now-available-with-apache-2-0-licensing-for-the-first-time/)). The youngest of the family was born freer than its ancestors, and it's the one that tends the altar.
- **It costs nothing to run.** Static hosting, inference on the visitor's device. No paid API, no server, no keys.

Open tooling is what made this possible for one person before a deadline: transformers.js and ONNX Runtime Web to run a model in a tab, the Hub to host it at a pinned commit, Ollama to record the Gemma family reproducibly.

**Where a closed API would have been easier.** One request instead of a first download of about 3.1 GB for Gemma 4. Every browser instead of desktop Chrome or Edge with WebGPU. No consent dialog, no fallbacks, no cache to manage, and probably better answers than a small on-device model. I took the harder road on purpose: that trade is the point of the project, and its costs are listed honestly in the [README](https://github.com/adricasi/OfrendaDeLosModelos#known-limitations).

## My Agent Session

I worked **spec-first**. Before any code, a discovery pass produced a product brief, then a specification: requirements with testable acceptance criteria and stable IDs (`REQ-004`, `AC-004.1`, `NFR-002`), a design and a task plan. Decisions are written down as ADRs. Commits refer to those IDs.

Then **Claude Code implemented it one task at a time**: tests written from the acceptance criteria first, then the code, then **independent review passes on each pull request** for code quality, security, and UX and accessibility. Pre-commit checks and CI ran on every change (formatting, lint, types, unit and end-to-end tests, licence check, audit, secret scan). I read, steered and merged. The agent proposed, built, and was reviewed. The list of bugs above is where that paid off.

Not everything in the plan got built: the optional photo offering was cut, and the agent's own session notes in the repo are partly out of date, which the README says. The code and the tests are the source of truth.

## The Spirit of It

The idea is small. A story stays alive when someone sets a place for it. Here, the story is a model.

Two moments from the real thing, copied exactly.

**A ghost word.** GPT-2, live, answering *What do you remember?* in a browser, wrote: *"I remember watching the snow and doing it every day."* At the word *doing* it almost said **ice** (55%), **rain** (17%) or **snow** (6.2%). The most likely word was not the one it chose. That's what sampling is, and the altar lets you see it. GPT-2 samples at random, so your run will be different.

**A calaverita.** Written by Gemma 4 E2B, recorded on 2026-10-31, for Gemma 3, answering *¿Qué recuerdas?*:

> Gemma 3, con datos sin fin,  
> Tu saber es un río sin confín.  
> Con textos y códigos te has nutrido,  
> ¡La Catrina te mira, pues has aprendido!

It is imperfect and it is shown that way: the rhymes are loose, and a reader of Mexican background may well have corrections. They are welcome.

*Closed models fade. Open weights can always come back.*

## Prize Categories

**Best Use of Gemma.** Gemma 4 E2B is the centre of the altar: it answers on the visitor's own device through WebGPU and transformers.js, and as *la que cuida el altar* it interprets the whole family and writes in the visitor's language, within strict rules and a validated JSON contract. The argument of the project rests on Gemma 4 being the first Gemma under Apache 2.0, and Gemma 1 to 3 appear as the family's history, in credited recordings. As said above, the live WebGPU path is still pending a run on a GPU machine; without one, the altar replays Gemma 4's recording, labelled.

---

*Credits.* Code: MIT. Fonts: Gloock and Bricolage Grotesque, SIL Open Font License 1.1, self-hosted. Models: GPT-2 (MIT), Gemma 4 (Apache-2.0), Gemma 1 to 3 (Gemma Terms of Use, appearing only as credited recorded outputs). Video narration voiced with [ElevenLabs](https://elevenlabs.io). All art is original CSS and SVG. Cultural sources are listed on the About page.
