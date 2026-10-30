/// <reference lib="webworker" />
import { createInferenceHost } from "./inference-host.js";
import type { UiToWorkerMessage, WorkerToUiMessage } from "./protocol.js";
import { createTransformersRuntime } from "./transformers-runtime.js";

/** The inference worker (module worker): transformers.js runs here, off the main thread. */
const host = createInferenceHost({
  runtime: createTransformersRuntime(),
  send: (message: WorkerToUiMessage): void => {
    self.postMessage(message);
  },
});

self.addEventListener("message", (event: MessageEvent<UiToWorkerMessage>) => {
  host.handle(event.data);
});
