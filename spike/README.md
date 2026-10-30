# T-001 spike (throwaway, never merged)

A diagnostic page for task T-001. It is not part of the product. It lives outside `public/` so Vite
never builds or deploys it. This branch (`feat/t-001-spike`) is never merged into `main`, and the
spike is deleted after the T-001 results are recorded.

It checks, in the founder's own browser (desktop Chrome or Edge with WebGPU):

- the environment (WebGPU, adapter, memory);
- which GPT-2 and Gemma 4 E2B ONNX repositories exist (live Hugging Face API; commit sha, licence, files);
- GPT-2 on WebGPU with the top-3 alternatives per step (a `LogitsProcessor`);
- Gemma 4 E2B on WebGPU writing one calaverita in Spanish (fallback loader and editable dtype map included);
- load time, download size, time to first token, tokens per second;
- every network host used (needed for the product's CSP `connect-src`).

## Run locally

From a clone with this branch checked out (the page is served from your own machine only):

```bash
git fetch origin feat/t-001-spike && git switch feat/t-001-spike
npx serve spike            # or: python3 -m http.server -d spike 8080
```

Open http://localhost:3000/ (`npx serve` prints its port) or http://localhost:8080/ in desktop
Chrome or Edge. Work through sections 0 to 4 in order and pick the model ids in section 2 (the
preselected ones are only candidates). Downloads are large (Gemma 4 is about 1 to 3 GB) and are
cached in the browser; use the "Clear cached files" buttons to measure a cold download again.
Section 5 is a shell snippet for the Ollama tags (candidates, verify). Press "Copy report" and
paste the JSON back.

## Privacy and dependencies

The page has its own Content Security Policy (meta tag): `'self'`, `cdn.jsdelivr.net` (the library
and ONNX Runtime WebAssembly), and `huggingface.co` / `*.hf.co` (API and model files). A blocked
host appears in the report errors as `csp`. Nothing is sent anywhere else. transformers.js 4.3.1
(Apache-2.0) is loaded from jsDelivr only for this spike (no SRI is possible for it, which is why
the spike is never deployed); the product self-hosts it. All text is rendered with `textContent`.
