import { FabricImage } from "fabric";
import { applyLook, defaults } from "./adjustments";
import type { FilterInstance, Adjustments } from "./adjustments";
export class FilterRenderer {
  private worker: Worker | undefined;
  private workerKey = "";
  private id = 0;
  private pending = new Map<
    number,
    { resolve: (pixels: ImageData) => void; reject: (error: Error) => void }
  >();
  private sources = new WeakMap<
    FabricImage,
    { element: CanvasImageSource; key: string }
  >();
  private generations = new WeakMap<FabricImage, number>();
  private closed = false;
  constructor() {
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined")
      return;
    try {
      this.worker = new Worker(new URL("./filter.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (event) => {
        const task = this.pending.get(event.data.id);
        if (!task) return;
        this.pending.delete(event.data.id);
        if (event.data.error) task.reject(new Error(event.data.error));
        else task.resolve(event.data.pixels);
      };
      this.worker.onerror = () => {
        for (const task of this.pending.values())
          task.reject(new Error("Background filtering is unavailable."));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = undefined;
        this.workerKey = "";
      };
    } catch {
      this.worker = undefined;
    }
  }
  async render(
    image: FabricImage,
    stack: FilterInstance[],
    manual: Adjustments,
  ) {
    if (this.closed) return false;
    const generation = (this.generations.get(image) || 0) + 1;
    this.generations.set(image, generation);
    if (
      !stack.length &&
      Object.keys(defaults()).every((k) => manual[k as keyof Adjustments] === 0)
    ) {
      image.filters = [];
      image.applyFilters();
      return true;
    }
    if (!this.worker) {
      applyLook(image, stack, manual);
      return true;
    }
    let source = this.sources.get(image);
    if (!source || source.element !== image._originalElement) {
      source = { element: image._originalElement, key: crypto.randomUUID() };
      this.sources.set(image, source);
    }
    // Read original pixels once per source switch. Transferring raw pixels avoids
    // extra ImageBitmap premultiplication rounding on transparent images.
    let pixels: ImageData | undefined;
    if (this.workerKey !== source.key) {
      const canvas = document.createElement("canvas");
      canvas.width = image._originalElement.width;
      canvas.height = image._originalElement.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image._originalElement, 0, 0);
      pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }
    const id = ++this.id;
    this.workerKey = source.key;
    let result: ImageData;
    try {
      result = await new Promise<ImageData>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker!.postMessage(
          {
            id,
            key: source!.key,
            pixels,
            stack: stack.map((f) => f.preset),
            manual,
          },
          { transfer: pixels ? [pixels.data.buffer] : [] },
        );
      });
    } catch (error) {
      this.workerKey = "";
      if (this.closed) return false;
      if (generation === this.generations.get(image)) {
        applyLook(image, stack, manual);
        return true;
      }
      throw error;
    }
    if (this.closed || generation !== this.generations.get(image)) return false;
    const output = image._filteredEl || document.createElement("canvas");
    output.width = result.width;
    output.height = result.height;
    output.getContext("2d")!.putImageData(result, 0, 0);
    image.filters = [];
    image._filteredEl = output;
    image._element = output;
    image.set("dirty", true);
    return true;
  }
  dispose() {
    this.closed = true;
    this.worker?.terminate();
    for (const task of this.pending.values())
      task.reject(new Error("Editor closed."));
    this.pending.clear();
  }
}
