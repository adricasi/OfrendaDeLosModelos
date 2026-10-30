import type { ModelWorkerPort, UiToWorkerMessage, WorkerToUiMessage } from "./protocol.js";

/**
 * The worker used until the real inference workers exist (T-004, T-006): every request fails,
 * so each live ancestor shows "could not come tonight" and the ritual carries on (AC-003.3).
 */
export function createUnavailableWorker(): ModelWorkerPort {
  const listeners = new Set<(message: WorkerToUiMessage) => void>();
  const reply = (message: WorkerToUiMessage): void => {
    queueMicrotask(() => {
      for (const listener of [...listeners]) listener(message);
    });
  };
  return {
    post(message: UiToWorkerMessage): void {
      if (message.type === "load") {
        reply({ type: "error", modelId: message.modelId, message: "No model runtime yet." });
      } else if (message.type === "generate") {
        reply({ type: "error", requestId: message.requestId, message: "No model runtime yet." });
      }
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
