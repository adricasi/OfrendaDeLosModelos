import type { ModelWorkerPort, UiToWorkerMessage, WorkerToUiMessage } from "./protocol.js";

type Listener = (message: WorkerToUiMessage) => void;

/** Wraps a Web Worker in the UI's end of the typed channel. */
export function portForWorker(worker: Worker): ModelWorkerPort {
  const listeners = new Set<Listener>();
  const broadcast = (message: WorkerToUiMessage): void => {
    for (const listener of [...listeners]) listener(message);
  };
  worker.addEventListener("message", (event: MessageEvent<WorkerToUiMessage>) => {
    broadcast(event.data);
  });
  worker.addEventListener("error", (event) => {
    // A worker that cannot even start must fail every waiting step, not leave them hanging.
    broadcast({
      type: "error",
      message: event.message === "" ? "The model worker failed to start." : event.message,
    });
  });
  return {
    post(message: UiToWorkerMessage): void {
      worker.postMessage(message);
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Creates the worker on first use, so loading the page never starts the model runtime. */
export function lazyPort(create: () => ModelWorkerPort): ModelWorkerPort {
  const listeners = new Set<Listener>();
  let port: ModelWorkerPort | null = null;
  const ensure = (): ModelWorkerPort => {
    port ??= create();
    // One subscription to the real port, fanned out here, whenever it is created.
    if (!subscribed) {
      subscribed = true;
      port.subscribe((message) => {
        for (const listener of [...listeners]) listener(message);
      });
    }
    return port;
  };
  let subscribed = false;
  return {
    post(message): void {
      ensure().post(message);
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
