# T-001 spike (throwaway)

A diagnostic page for task T-001. It is not part of the product and is deleted after the
decision is recorded.

It checks, in the founder's own browser (desktop Chrome or Edge with WebGPU):

- the environment (WebGPU, adapter, memory);
- which GPT-2 and Gemma 4 E2B ONNX repositories exist (live Hugging Face API; commit sha, licence, files);
- GPT-2 on WebGPU with the top-3 alternatives per step (a `LogitsProcessor`);
- Gemma 4 E2B on WebGPU writing one calaverita in Spanish;
- load time, download size, time to first token, tokens per second;
- every network host used (needed for the CSP `connect-src`).

## Use

1. Serve the folder (for example `npm run dev` once T-002 lands, or `npx serve public`) and open `/spike/`.
2. Work through sections 0 to 4 in order. Pick the model ids in section 2 (the preselected ones are
   only candidates). Downloads are large (Gemma 4 is about 1 to 3 GB); they are cached in the
   browser, so use the "Clear cached files" buttons to measure a cold download again.
3. Section 5 is a shell snippet for the Ollama tags (candidates, verify).
4. Press "Copy report" and paste the JSON back.

## Privacy and dependencies

Nothing is sent anywhere except the Hugging Face API and model downloads (plus the transformers.js
library and ONNX Runtime WebAssembly files from jsDelivr). transformers.js 4.3.1 (Apache-2.0) is
loaded from jsDelivr only for this spike; the product self-hosts it. All text is rendered with
`textContent`.
