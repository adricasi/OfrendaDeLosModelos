import type { ModelWorkerPort, UiToWorkerMessage, WorkerToUiMessage } from "../worker/protocol.js";

/** `?debug` asks for load times, tokens per second and errors in the browser console (NFR-007). */
export function debugRequested(search: string): boolean {
  return new URLSearchParams(search).has("debug");
}

export interface DebugSink {
  info(message: string): void;
  error(message: string): void;
}

export interface DebugClock {
  now(): number;
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function seconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

interface Answer {
  readonly modelId: string;
  readonly started: number;
  firstToken: number | null;
  tokens: number;
}

/**
 * Wraps a worker port and writes what passes through it to the console. It only reads the
 * messages: nothing leaves the device and no question or answer text is logged, only counts
 * and timings (NFR-002, NFR-007).
 */
export function withDebugLogging(
  port: ModelWorkerPort,
  sink: DebugSink,
  clock: DebugClock = performance,
): ModelWorkerPort {
  const loadStarted = new Map<string, number>();
  const lastTotals = new Map<string, number>();
  const answers = new Map<string, Answer>();

  port.subscribe((message: WorkerToUiMessage) => {
    switch (message.type) {
      case "progress":
        lastTotals.set(message.modelId, message.total);
        break;
      case "ready": {
        const started = loadStarted.get(message.modelId);
        const total = lastTotals.get(message.modelId);
        const parts = [
          message.device === undefined ? null : `on ${message.device}`,
          message.dtype ?? null,
          total === undefined ? null : megabytes(total),
        ].filter((part) => part !== null);
        const took = started === undefined ? "" : ` in ${seconds(clock.now() - started)}`;
        const detail = parts.length === 0 ? "" : ` (${parts.join(", ")})`;
        sink.info(`[ofrenda] ${message.modelId} ready${took}${detail}`);
        break;
      }
      case "token": {
        const answer = answers.get(message.requestId);
        if (answer === undefined) break;
        answer.tokens += 1;
        answer.firstToken ??= clock.now();
        break;
      }
      case "done": {
        const answer = answers.get(message.requestId);
        if (answer === undefined) break;
        answers.delete(message.requestId);
        const end = clock.now();
        const first = answer.firstToken ?? end;
        const generating = end - first;
        const rate =
          answer.tokens > 1 && generating > 0
            ? `${(((answer.tokens - 1) * 1000) / generating).toFixed(1)} tokens/s`
            : "tokens/s n/a";
        sink.info(
          `[ofrenda] ${answer.modelId} answered: ${String(answer.tokens)} tokens, first token after ${seconds(first - answer.started)}, ${rate}`,
        );
        break;
      }
      case "error": {
        const answer = message.requestId === undefined ? undefined : answers.get(message.requestId);
        if (message.requestId !== undefined) answers.delete(message.requestId);
        const subject = answer?.modelId ?? message.modelId ?? "worker";
        sink.error(`[ofrenda] ${subject} error: ${message.message}`);
        break;
      }
    }
  });

  return {
    post(message: UiToWorkerMessage): void {
      if (message.type === "load") loadStarted.set(message.modelId, clock.now());
      if (message.type === "generate") {
        answers.set(message.requestId, {
          modelId: message.modelId,
          started: clock.now(),
          firstToken: null,
          tokens: 0,
        });
      }
      port.post(message);
    },
    subscribe: (listener) => port.subscribe(listener),
  };
}
