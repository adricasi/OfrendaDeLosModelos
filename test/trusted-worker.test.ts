import { describe, expect, it } from "vitest";

import {
  WORKER_POLICY_NAME,
  knownScripts,
  serviceWorkerScriptUrl,
  workerScriptUrl,
} from "../src/worker/trusted-worker.js";

const ORIGIN = "https://adricasi.github.io";
const BASE = "/OfrendaDeLosModelos/";
const WORKER = `${BASE}assets/inference.worker-abc12345.js`;
const known = knownScripts(WORKER, BASE, ORIGIN);

type Rules = { createScriptURL(input: string): string };

function fakeFactory() {
  const created: string[] = [];
  const box: { rules: Rules | null } = { rules: null };
  const factory = {
    createPolicy(name: string, given: Rules) {
      created.push(name);
      box.rules = given;
      return { createScriptURL: (input: string) => given.createScriptURL(input) };
    },
  };
  return { factory, created, box };
}

describe("the Trusted Types policy", () => {
  it("returns plain URLs where Trusted Types do not exist", () => {
    expect(workerScriptUrl(known, undefined)).toBe(`${ORIGIN}${WORKER}`);
    expect(serviceWorkerScriptUrl(known, undefined)).toBe(`${ORIGIN}${BASE}sw.js`);
  });

  it("knows exactly the built worker URL and <origin><base>sw.js", () => {
    expect(known).toEqual({
      inferenceWorker: `${ORIGIN}${WORKER}`,
      serviceWorker: `${ORIGIN}${BASE}sw.js`,
    });
  });

  it("is one named policy that vouches for those two URLs only", () => {
    const { factory, created, box } = fakeFactory();
    expect(workerScriptUrl(known, factory)).toBe(known.inferenceWorker);
    expect(serviceWorkerScriptUrl(known, factory)).toBe(known.serviceWorker);
    expect(created).toEqual([WORKER_POLICY_NAME]);
    const rejected = [
      "https://evil.example/x.js",
      `${ORIGIN}/other-repo/sw.js`, // same origin, another site of the same owner
      `${ORIGIN}${BASE}other.js`,
      `${ORIGIN}${BASE}assets/inference.worker-other123.js`,
      `${ORIGIN}${BASE}sw.js?x=1`,
      `${ORIGIN}${BASE}nested/sw.js`,
      `${ORIGIN}/OfrendaDeLosModelos-evil/sw.js`,
    ];
    for (const url of rejected) {
      expect(() => box.rules?.createScriptURL(url), url).toThrow(TypeError);
    }
  });

  it("refuses a built worker URL from another origin", () => {
    expect(() => knownScripts("https://evil.example/w.js", BASE, ORIGIN)).toThrow(/this site/);
  });
});
