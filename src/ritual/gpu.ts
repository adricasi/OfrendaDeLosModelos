/** The slice of `navigator.gpu` the detection needs (the DOM typings do not include WebGPU). */
interface GpuHolder {
  readonly gpu?: { requestAdapter(): Promise<unknown> } | undefined;
}

/**
 * REQ-010: a browser supports the live ritual when `navigator.gpu` exists and it hands out an
 * adapter. A missing API, a null adapter or a throwing request all mean "no WebGPU".
 */
export async function detectWebGpu(nav: object): Promise<boolean> {
  const { gpu } = nav as GpuHolder;
  if (gpu === undefined || gpu === null) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

export const NO_WEBGPU_MESSAGE =
  "This browser has no WebGPU, so most ancestors speak from recordings. For the live ritual, use Chrome or Edge on a desktop computer.";
