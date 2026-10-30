import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadAltarData, type AltarData, type FetchLike } from "../src/data/load.js";

export function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const fileFetch: FetchLike = (url) => {
  const file = url.split("/data/")[1] ?? "";
  const body: unknown = JSON.parse(read(`public/data/${file}`));
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
};

export function loadTestData(): Promise<AltarData> {
  return loadAltarData("/OfrendaDeLosModelos/", fileFetch);
}

/** Puts the static markup of index.html into the jsdom document. */
export function mountPage(): void {
  const body = /<body>([\s\S]*)<\/body>/.exec(read("index.html"))?.[1] ?? "";
  document.body.innerHTML = body;
}

/** Lets queued microtasks and zero-delay timers run. */
export async function settle(times = 1): Promise<void> {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}
