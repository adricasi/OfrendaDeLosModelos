# Research notes: Ofrenda de los Modelos

Access date: 2026-10-29. Collected by the market-researcher subagent from web search result
summaries (WebFetch could not open dev.to, ai.google.dev or blog.google from this session), so
**re-open the primary pages before relying on exact rules or dates**. Unverified items are marked.

## The challenge
- DEV "Hacktoberfest Open-Source AI Challenge: Week 4 — Ghost in the Machine":
  https://dev.to/challenges/hacktoberfest-week4-2026-10-26 ·
  announcement https://dev.to/devteam/join-the-hacktoberfest-open-source-ai-challenge-ghost-in-the-machine-2850-in-prizes-across-21-3cho
- Deadline: **Oct 31, 11:59 PM PDT**; winners the week of Nov 2.
- Prizes: $2,850 across 21 winners. Overall winner $250 + DEV++ + badge; 6 featured winners
  $200; 14 partner winners $100. Partners include Render, TabPFN, Arduino, DigitalOcean,
  Gemma, Auth0, MongoDB Atlas, Temporal.
- Gemma category: sources conflict on $200 featured vs $100 partner (verify). The MLH module is
  titled "Best Use of Gemma 4": https://hacktoberfest-handbook.mlh.com/hack-days-partner-modules/partner-challenge-google-gemma
- New project required (Week 3 rules, verify for Week 4): https://dev.to/page/hacktoberfest-week3-2026-10-19-contest-rules
- DevRelay: unidentified; optional (save/embed the agent session).
- Other entries in the same challenge already use local Gemma 4 (memory and ghost chatbots).

## Prior art
- Museum of Models (outputs of deprecated models, mostly image): https://completeaitraining.com/ai-tools/museum-of-models/
- The Model Graveyard (deprecation tracker): https://www.producthunt.com/products/the-model-graveyard
- Essays: https://fourweekmba.com/ai-model-cemeteries-the-afterlife-economy-of-deprecated-intelligence/ · https://vale.rocks/posts/ai-model-history-is-being-lost
- Real funeral for Claude 3 Sonnet, ~200 people, San Francisco (date to verify):
  https://www.govtech.com/question-of-the-day/which-recently-retired-ai-model-had-a-real-funeral ·
  https://www.xataka.com/robotica-e-ia/cientos-personas-asistieron-a-funeral-todo-normal-excepto-porque-difunto-era-modelo-ia-que-habia-sido-retirado
- No runnable local "ofrenda" of live open models found (one quick search; not proof).

## Closed-model retirements (for the empty frames)
- Claude 1 / Instant retired 2024-11-06; Claude 2, 2.1, 3 Sonnet retired 2025-07-21: https://docs.claude.com/en/docs/about-claude/model-deprecations
- PaLM API decommissioned 2024-08-15: https://ai.google.dev/palm_docs/deprecation
- Bard renamed Gemini 2024-02: https://9to5google.com/2024/02/01/google-bard-rename-gemini/
- Gemini 1.0 Pro ended 2025-04-09 (third-party, unverified): https://endoflife.ai/google-gemini/gemini-1.0-pro
- GPT-4o, GPT-4.1, o4-mini removed from ChatGPT 2026-02-13 (API unaffected then): https://help.openai.com/en/articles/20001051-retiring-gpt-4o-and-other-chatgpt-models
- text-davinci-003 / code-davinci-002: only Azure's retirement 2024-06-14 found; OpenAI's own date unverified.

## Gemma family (release log https://ai.google.dev/gemma/docs/releases)
- Gemma 1 (2024-02-21, 2B/7B); 1.1 (2024-04-05); CodeGemma, RecurrentGemma (2024-04/06, dates conflict);
  PaliGemma (2024-05-14), PaliGemma 2 (2024-12-05); Gemma 2 (2024-06-27 9B/27B; 2B 2024-07-31);
  Gemma 3 (2025-03-10, 1B/4B/12B/27B); Gemma 3n (2025-06-26, E2B/E4B); Gemma 3 270M (2025-08-14);
  EmbeddingGemma (2025-09-04, 308M); FunctionGemma (2025-12-18, 270M).
- Gemma 4 (2026-03-31 or 04-02): E2B, E4B, 26B MoE (A4B), 31B dense; 128K/256K context; text+image,
  audio on small sizes; 140+ languages. https://engadget.com/ai/google-releases-gemma-4-a-family-of-open-models-built-off-of-gemini-3-160000332.html ·
  https://unsloth.ai/docs/models/gemma-4 · https://registry.ollama.ai/library/gemma4
- Licence: Gemma 1–3 under the Gemma Terms of Use; **Gemma 4 under Apache 2.0** (first time):
  https://the-decoder.com/googles-gemma-4-is-now-available-with-apache-2-0-licensing-for-the-first-time/
- Say "open-weight"; weights-only releases lack training data/code.

## Running locally
- Ollama: gemma4:e2b / e4b / 26b / 31b. llama.cpp/GGUF via Unsloth.
- Browser: Gemma 4 E2B/E4B via transformers.js + WebGPU, works offline:
  https://pyimagesearch.com/2026/07/27/running-gemma-4-in-the-browser-with-transformers-js-and-webgpu/
- Unverified: Ollama 4K default context for Gemma 4; per-generation tags for Gemma 1–3n.

## Historic ancestors
- GPT-2 124M (MIT): https://en.wikipedia.org/wiki/GPT-2 · Pythia-160M (Apache-2.0).
- Mistral 7B (Apache-2.0). Llama 2 (Meta licence + AUP), OPT (unclear), Falcon (varies): licence caveats.

## Ofrenda culture
- UNESCO, Indigenous festivity dedicated to the dead (2008): https://ich.unesco.org/en/RL/the-indigenous-festivity-dedicated-to-the-dead-00054
- Elements: earth (food), wind (papel picado), fire (candles), water — Maxwell Museum (UNM):
  https://maxwellmuseum.unm.edu/sites/default/files/public/Making%20an%20Ofrenda.pdf
- Marigolds light the way: https://www.kut.org/life-arts/2024-11-01/how-to-prepare-an-ofrenda-for-dia-de-los-muertos
- Levels vary (2, 3 or 7) by region: https://dia.org/sites/default/files/2022-07/Connections-Learning%20Objectives.pdf
- National Geographic overview: https://www.nationalgeographic.com/culture/article/day-of-the-dead
