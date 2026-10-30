# 0002. Static site with in-browser inference

- Status: Proposed
- Date: 2026-10-30

## Context
The altar must be easy to visit (one link, judges won't install anything), run the models on
the visitor's own device (the project's point about open weights), cost nothing to run, and
ship before the challenge deadline (Oct 31). The product's deployment target is
"Local / on-device" (product.md).

## Decision
Ship a static site on GitHub Pages. GPT-2 and Gemma 4 run in the visitor's browser on WebGPU;
the middle generations are recorded voices replayed from JSON. No backend.

## Alternatives
- A local Node app with Ollama running every ancestor live: richer, but needs an install and a
  ~10 GB download, so few people would try it.
- A hosted API serving open-weight models: easy to visit, but inference would leave the
  visitor's device and add running cost, contradicting the project's argument.

## Consequences
- One link works for anyone with desktop Chrome or Edge (WebGPU); other browsers get a
  recorded ritual.
- The first visit downloads the models (budget ≤ 2.5 GB, with consent for Gemma 4); later
  visits and offline use are served from the browser cache.
- Only small models can be live; the middle generations are recorded and labelled as such.
- No server means no secrets, no visitor data and €0 running cost.
