import { Canvas2dFilterBackend } from "fabric";
import type { T2DPipelineState } from "fabric";
import { adjustmentFilters, presets } from "./adjustments";
import type { Adjustments, Preset } from "./adjustments";
let cachedKey = "",
  original: ImageData | undefined,
  cachedStack: Preset[] = [],
  cachedPixels: ImageData | undefined;
const canvas = new OffscreenCanvas(1, 1),
  ctx = canvas.getContext("2d", { willReadFrequently: true })!,
  backend = new Canvas2dFilterBackend();
function copy(data: ImageData) {
  return new ImageData(
    new Uint8ClampedArray(data.data),
    data.width,
    data.height,
  );
}
function apply(data: ImageData, values: Adjustments) {
  const state = {
    imageData: data,
    sourceWidth: data.width,
    sourceHeight: data.height,
    ctx,
    canvasEl: canvas,
    originalEl: canvas,
    filterBackend: backend,
  } as unknown as T2DPipelineState;
  for (const filter of adjustmentFilters(values))
    if (!filter.isNeutralState()) filter.applyTo2d(state);
  return state.imageData;
}
self.onmessage = (
  event: MessageEvent<{
    id: number;
    key: string;
    pixels?: ImageData;
    stack: Preset[];
    manual: Adjustments;
  }>,
) => {
  const { id, key, pixels, stack, manual } = event.data;
  try {
    if (key !== cachedKey) {
      if (!pixels) throw new Error("The filter source is unavailable.");
      original = pixels;
      cachedKey = key;
      cachedStack = [];
      cachedPixels = undefined;
    }
    const reuse =
      !!cachedPixels &&
      cachedStack.length <= stack.length &&
      cachedStack.every((p, i) => p === stack[i]);
    let data = copy(reuse ? cachedPixels! : original!);
    for (let i = reuse ? cachedStack.length : 0; i < stack.length; i++)
      data = apply(data, presets[stack[i]].adjustments);
    if (!reuse || cachedStack.length !== stack.length) {
      cachedPixels = copy(data);
      cachedStack = [...stack];
    }
    data = apply(data, manual);
    self.postMessage({ id, pixels: data }, { transfer: [data.data.buffer] });
  } catch (error) {
    cachedKey = "";
    self.postMessage({
      id,
      error:
        error instanceof Error ? error.message : "Filter processing failed.",
    });
  }
};
