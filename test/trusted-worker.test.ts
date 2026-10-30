import { describe, expect, it } from "vitest";

import {
  WORKER_POLICY_NAME,
  serviceWorkerScriptUrl,
  workerScriptUrl,
} from "../src/worker/trusted-worker.js";

const ORIGIN = "https://adricasi.github.io";
const WORKER = new URL("/OfrendaDeLosModelos/assets/inference.worker-abc.js", ORIGIN);

describe("the worker's Trusted Types policy", () => {
  it("returns the plain URL where Trusted Types do not exist", () => {
    expect(workerScriptUrl(WORKER, undefined, ORIGIN)).toBe(WORKER.href);
  });

  it("creates a named policy that vouches for the worker URL only", () => {
    const created: string[] = [];
    let rules: { createScriptURL(input: string): string } | null = null;
    const factory = {
      createPolicy(name: string, given: { createScriptURL(input: string): string }) {
        created.push(name);
        rules = given;
        return { createScriptURL: (input: string) => given.createScriptURL(input) };
      },
    };
    expect(workerScriptUrl(WORKER, factory, ORIGIN)).toBe(WORKER.href);
    expect(created).toEqual([WORKER_POLICY_NAME]);
    expect(() => rules?.createScriptURL("https://evil.example/x.js")).toThrow(TypeError);
  });

  it("also vouches for the service worker, with one policy, and for nothing else", () => {
    const created: string[] = [];
    let rules: { createScriptURL(input: string): string } | null = null;
    const factory = {
      createPolicy(name: string, given: { createScriptURL(input: string): string }) {
        created.push(name);
        rules = given;
        return { createScriptURL: (input: string) => given.createScriptURL(input) };
      },
    };
    const sw = new URL("/OfrendaDeLosModelos/sw.js", ORIGIN);
    expect(workerScriptUrl(WORKER, factory, ORIGIN)).toBe(WORKER.href);
    expect(serviceWorkerScriptUrl(sw, factory, ORIGIN)).toBe(sw.href);
    expect(created).toEqual([WORKER_POLICY_NAME]);
    expect(() => rules?.createScriptURL(new URL("/x/other.js", ORIGIN).href)).toThrow(TypeError);
  });

  it("refuses to register anything but sw.js, or one from another origin", () => {
    expect(() => serviceWorkerScriptUrl(WORKER, undefined, ORIGIN)).toThrow(/sw\.js/);
    expect(() =>
      serviceWorkerScriptUrl(new URL("https://evil.example/sw.js"), undefined, ORIGIN),
    ).toThrow(/this site/);
  });

  it("refuses a worker script from another origin", () => {
    expect(() => workerScriptUrl(new URL("https://evil.example/w.js"), undefined, ORIGIN)).toThrow(
      /this site/,
    );
  });
});
