import {
  Canvas,
  FabricImage,
  FabricObject,
  Rect,
  setFilterBackend,
  Canvas2dFilterBackend,
} from "fabric";
setFilterBackend(new Canvas2dFilterBackend());
import { defaults, presets } from "./adjustments";
import type { Adjustments, FilterInstance, Preset } from "./adjustments";
import { FilterRenderer } from "./filter-renderer";
import { encodeCanvas } from "./media";
export * from "./adjustments";
export type Layer = FabricObject & {
  id: string;
  name: string;
  layerType: "base-image" | "image" | "sticker";
  filterStack: FilterInstance[];
  adjustments: Adjustments;
  locked: boolean;
};
FabricObject.customProperties = [
  "id",
  "name",
  "layerType",
  "filterStack",
  "adjustments",
  "locked",
];
Object.assign(FabricObject.ownDefaults, {
  cornerColor: "#fff",
  cornerStrokeColor: "#c45b89",
  borderColor: "#c45b89",
  transparentCorners: false,
  cornerStyle: "circle",
  cornerSize: 12,
});
export interface Snapshot {
  width: number;
  height: number;
  name: string;
  canvas: ReturnType<Canvas["toJSON"]>;
}
export interface StoredProject {
  current: Snapshot;
  initial: Snapshot | null;
}
export class Editor {
  canvas: Canvas;
  width = 1200;
  height = 900;
  name = "Untitled edit";
  initial: Snapshot | null = null;
  history: Snapshot[] = [];
  cursor = -1;
  restoring = false;
  crop: Rect | null = null;
  notify: () => void = () => {};
  onError: (m: string) => void = () => {};
  private renderer = new FilterRenderer();
  private renderTasks = new Set<Promise<unknown>>();
  private revision = 0;
  private exportCache: { key: string; blob: Blob } | undefined;
  private observer: ResizeObserver;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    element: HTMLCanvasElement,
    private host: HTMLElement,
  ) {
    this.canvas = new Canvas(element, {
      preserveObjectStacking: true,
      selection: false,
    });
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(host);
    this.canvas.on("object:modified", (e) => {
      if (e.target !== this.crop) this.commit();
      else this.notify();
    });
    for (const event of [
      "selection:created",
      "selection:updated",
      "selection:cleared",
    ] as const)
      this.canvas.on(event, () => this.notify());
    this.fit();
  }
  get layers() {
    return this.canvas.getObjects().filter((x) => x !== this.crop) as Layer[];
  }
  get selected() {
    const o = this.canvas.getActiveObject();
    return o && o !== this.crop ? (o as Layer) : undefined;
  }
  get ready() {
    return this.history.length > 0;
  }
  fit() {
    const z = Math.max(
      0.01,
      Math.min(
        (this.host.clientWidth - 64) / this.width,
        (this.host.clientHeight - 64) / this.height,
        1,
      ),
    );
    this.canvas.setDimensions({
      width: Math.round(this.width * z),
      height: Math.round(this.height * z),
    });
    this.canvas.setViewportTransform([z, 0, 0, z, 0, 0]);
    this.canvas.requestRenderAll();
    this.notify();
  }
  snapshot(): Snapshot {
    return {
      width: this.width,
      height: this.height,
      name: this.name,
      canvas: this.canvas.toJSON(),
    };
  }
  commit() {
    if (this.restoring) return;
    this.revision++;
    this.exportCache = undefined;
    this.history = this.history.slice(0, this.cursor + 1);
    this.history.push(this.snapshot());
    if (this.history.length > 60) this.history.shift();
    this.cursor = this.history.length - 1;
    this.notify();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(
      () =>
        saveProject({ current: this.snapshot(), initial: this.initial }).catch(
          () =>
            this.onError(
              "Browser storage is full. Export your edit before closing.",
            ),
        ),
      500,
    );
  }
  async restore(s: Snapshot) {
    this.restoring = true;
    this.revision++;
    this.exportCache = undefined;
    this.cancelCrop();
    try {
      await this.waitForRendering();
      const clean = {
        ...s.canvas,
        objects: s.canvas.objects.map((o: object) => ({ ...o, filters: [] })),
      };
      await this.canvas.loadFromJSON(clean);
      for (const layer of this.layers) {
        layer.filterStack = (layer.filterStack || []).filter((f) =>
          Object.hasOwn(presets, f.preset),
        );
        layer.adjustments = { ...defaults(), ...layer.adjustments };
        if (layer instanceof FabricImage)
          await this.renderer.render(
            layer,
            layer.filterStack,
            layer.adjustments,
          );
        if (layer.layerType === "base-image") this.lockBase(layer);
      }
      this.width = s.width;
      this.height = s.height;
      this.name = s.name;
      this.fit();
      const first = this.layers.find((l) => l.visible);
      if (first) this.canvas.setActiveObject(first);
    } finally {
      this.restoring = false;
      this.notify();
    }
  }
  async travel(delta: number) {
    const index = this.cursor + delta;
    if (this.restoring || index < 0 || index >= this.history.length) return;
    await this.restore(this.history[index]);
    this.cursor = index;
    this.notify();
    await saveProject({
      current: this.snapshot(),
      initial: this.initial,
    }).catch(() => {});
  }
  async importImage(
    url: string,
    name: string,
    mode: "new" | "image" | "sticker" = "new",
    native = false,
    bounds?: number[],
  ) {
    const image = await FabricImage.fromURL(url);
    if (mode === "sticker" && bounds)
      image.set({
        cropX: bounds[0],
        cropY: bounds[1],
        width: bounds[2],
        height: bounds[3],
      });
    const width = image.width,
      height = image.height;
    if (!width || !height)
      throw new Error("This image could not be decoded. Try a PNG or JPEG.");
    if (width * height > 64000000)
      throw new Error(
        "This image exceeds the 64-megapixel editing limit. Resize it first.",
      );
    if (mode === "new") {
      this.cancelCrop();
      this.canvas.clear();
      const scale = native
        ? 1
        : Math.min(
            1,
            6000 / width,
            6000 / height,
            Math.sqrt(24000000 / (width * height)),
          );
      this.width = Math.round(width * scale);
      this.height = Math.round(height * scale);
      image.scale(scale);
      image.set({ left: 0, top: 0 });
      this.name = name.replace(/\.[^.]+$/, "") || "Untitled edit";
      if (scale < 1)
        this.onError(
          "Eddict created an optimised working copy for smooth editing.",
        );
    } else {
      image.scale(
        Math.min((this.width * 0.5) / width, (this.height * 0.5) / height),
      );
      image.set({
        left: (this.width - image.getScaledWidth()) / 2,
        top: (this.height - image.getScaledHeight()) / 2,
      });
    }
    Object.assign(image, {
      id: crypto.randomUUID(),
      name: mode === "new" ? "Base photo" : name,
      layerType: mode === "new" ? "base-image" : mode,
      filterStack: [],
      adjustments: defaults(),
      locked: false,
    });
    if (mode === "new") this.lockBase(image as unknown as Layer);
    this.canvas.add(image);
    this.canvas.setActiveObject(image);
    this.fit();
    if (mode === "new") {
      this.history = [];
      this.cursor = -1;
      this.initial = this.snapshot();
    }
    this.commit();
  }
  select(layer: Layer) {
    this.canvas.setActiveObject(layer);
    this.canvas.requestRenderAll();
    this.notify();
  }
  change(values: Partial<Layer>) {
    const o = this.selected;
    if (!o) return;
    o.set(values);
    o.setCoords();
    this.canvas.requestRenderAll();
    this.notify();
  }
  remove() {
    const o = this.selected;
    if (!o || o.locked) return;
    this.canvas.remove(o);
    this.canvas.discardActiveObject();
    this.commit();
  }
  async duplicate() {
    const o = this.selected;
    if (!o) return;
    const clone = (await o.clone()) as Layer;
    clone.id = crypto.randomUUID();
    clone.name = o.name + " copy";
    clone.layerType = o.layerType === "base-image" ? "image" : o.layerType;
    clone.locked = false;
    clone.set({
      left: o.left + 24,
      top: o.top + 24,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
      hasControls: true,
    });
    if (clone instanceof FabricImage)
      await this.renderer.render(clone, clone.filterStack, clone.adjustments);
    this.canvas.add(clone);
    this.canvas.setActiveObject(clone);
    this.commit();
  }
  toggleLock(o: Layer) {
    if (o.layerType === "base-image") return;
    o.locked = !o.locked;
    o.set({
      lockMovementX: o.locked,
      lockMovementY: o.locked,
      lockScalingX: o.locked,
      lockScalingY: o.locked,
      lockRotation: o.locked,
      hasControls: !o.locked,
    });
    this.commit();
  }
  reorder(o: Layer, index: number) {
    this.canvas.moveObjectTo(
      o,
      Math.max(0, Math.min(this.layers.length - 1, index)),
    );
    this.commit();
  }
  lockBase(layer: Layer) {
    layer.locked = true;
    layer.set({
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      hasControls: false,
      hoverCursor: "default",
    });
  }
  async waitForRendering() {
    await Promise.all([...this.renderTasks]);
  }
  async look(stack: FilterInstance[], adjustments: Adjustments, commit = true) {
    const o = this.selected;
    if (!(o instanceof FabricImage)) return;
    o.filterStack = stack.map((f) => ({ ...f }));
    o.adjustments = { ...adjustments };
    this.revision++;
    this.exportCache = undefined;
    this.notify();
    const task = this.renderer.render(o, o.filterStack, adjustments);
    this.renderTasks.add(task);
    try {
      const applied = await task;
      if (applied) {
        this.canvas.requestRenderAll();
        if (commit) this.commit();
        else this.notify();
      }
    } finally {
      this.renderTasks.delete(task);
    }
  }
  async replacePhoto(url: string, name: string) {
    const old = this.selected;
    if (!(old instanceof FabricImage) || old.layerType === "sticker") return;
    const replacement = await FabricImage.fromURL(url);
    if (replacement.width * replacement.height > 64000000) {
      replacement.dispose();
      throw new Error("Choose an image below 64 megapixels.");
    }
    Object.assign(replacement, {
      id: old.id,
      name: old.layerType === "base-image" ? "Base photo" : name,
      layerType: old.layerType,
      filterStack: old.filterStack.map((f) => ({ ...f })),
      adjustments: { ...old.adjustments },
      locked: old.locked,
    });
    const base = old.layerType === "base-image";
    const targetW = base ? this.width : old.getScaledWidth(),
      targetH = base ? this.height : old.getScaledHeight();
    const scale = base
      ? Math.max(targetW / replacement.width, targetH / replacement.height)
      : Math.min(targetW / replacement.width, targetH / replacement.height);
    replacement.set({
      left: base ? (this.width - replacement.width * scale) / 2 : old.left,
      top: base ? (this.height - replacement.height * scale) / 2 : old.top,
      scaleX: scale,
      scaleY: scale,
      angle: base ? 0 : old.angle,
      opacity: old.opacity,
      visible: old.visible,
      flipX: old.flipX,
      flipY: old.flipY,
    });
    if (base) this.lockBase(replacement as unknown as Layer);
    else
      replacement.set({
        lockMovementX: old.locked,
        lockMovementY: old.locked,
        lockScalingX: old.locked,
        lockScalingY: old.locked,
        lockRotation: old.locked,
        hasControls: !old.locked,
      });
    await this.renderer.render(replacement, old.filterStack, old.adjustments);
    const index = this.layers.indexOf(old);
    this.canvas.remove(old);
    this.canvas.add(replacement);
    this.canvas.moveObjectTo(replacement, index);
    this.select(replacement as unknown as Layer);
    this.commit();
    old.dispose();
  }
  beforeCanvas() {
    const base = this.layers.find((l) => l.layerType === "base-image");
    if (!(base instanceof FabricImage)) return undefined;
    const element = base._element,
      filtered = base._filteredEl;
    try {
      base._element = base._originalElement;
      base._filteredEl = undefined;
      base.set("dirty", true);
      return this.canvas.toCanvasElement(1, { filter: (o) => o === base });
    } finally {
      base._element = element;
      base._filteredEl = filtered;
      base.set("dirty", true);
    }
  }
  addFilter(preset: Preset) {
    const o = this.selected;
    if (!o) return;
    return this.look(
      [...(o.filterStack || []), { id: crypto.randomUUID(), preset }],
      o.adjustments,
    );
  }
  removeFilter(id: string) {
    const o = this.selected;
    if (o)
      return this.look(
        o.filterStack.filter((f) => f.id !== id),
        o.adjustments,
      );
  }
  moveFilter(id: string, delta: number) {
    const o = this.selected;
    if (!o) return;
    const stack = [...o.filterStack],
      from = stack.findIndex((f) => f.id === id),
      to = from + delta;
    if (from < 0 || to < 0 || to >= stack.length) return;
    [stack[from], stack[to]] = [stack[to], stack[from]];
    return this.look(stack, o.adjustments);
  }
  resize(width: number, height: number) {
    if (!validSize(width, height))
      throw new Error(
        "Choose dimensions from 1 to 6000 px, up to 24 megapixels.",
      );
    const sx = width / this.width,
      sy = height / this.height,
      scale = Math.min(sx, sy);
    for (const o of this.layers) {
      o.set({
        left: o.left * sx,
        top: o.top * sy,
        scaleX: o.scaleX * scale,
        scaleY: o.scaleY * scale,
      });
      o.setCoords();
    }
    this.width = width;
    this.height = height;
    this.fit();
    this.commit();
  }
  startCrop(ratio: number | null) {
    this.cancelCrop();
    let w = this.width * 0.85,
      h = this.height * 0.85;
    if (ratio) {
      if (w / h > ratio) w = h * ratio;
      else h = w / ratio;
    }
    this.crop = new Rect({
      left: (this.width - w) / 2,
      top: (this.height - h) / 2,
      width: w,
      height: h,
      fill: "#ffffff18",
      stroke: "#bf4e7d",
      strokeWidth: 1,
      strokeUniform: true,
      excludeFromExport: true,
      lockRotation: true,
      lockScalingFlip: true,
    });
    this.crop.setControlsVisibility({
      mtr: false,
      ml: !ratio,
      mr: !ratio,
      mt: !ratio,
      mb: !ratio,
    });
    this.canvas.uniformScaling = !!ratio;
    this.canvas.add(this.crop);
    this.canvas.setActiveObject(this.crop);
    this.canvas.requestRenderAll();
    this.notify();
  }
  cancelCrop() {
    if (this.crop) {
      this.canvas.remove(this.crop);
      this.crop = null;
      this.canvas.uniformScaling = true;
      this.notify();
    }
  }
  applyCrop() {
    if (!this.crop) return;
    const b = this.crop.getBoundingRect(),
      x = Math.max(0, Math.round(b.left)),
      y = Math.max(0, Math.round(b.top)),
      w = Math.min(this.width - x, Math.round(b.width)),
      h = Math.min(this.height - y, Math.round(b.height));
    if (w < 1 || h < 1)
      throw new Error("Move the crop frame inside the photo.");
    this.cancelCrop();
    for (const o of this.layers) {
      o.set({ left: o.left - x, top: o.top - y });
      o.setCoords();
    }
    this.width = w;
    this.height = h;
    this.fit();
    this.commit();
  }
  zoomBase(factor: number) {
    const base = this.layers.find((o) => o.layerType === "base-image");
    if (!base) return;
    const center = base.getCenterPoint();
    base.scale(factor);
    base.setPositionByOrigin(center, "center", "center");
    this.canvas.requestRenderAll();
  }
  async reset() {
    if (this.initial) {
      await this.restore(this.initial);
      this.commit();
    }
  }
  async export(format: "png" | "jpeg" | "webp", quality: number) {
    if (this.restoring) throw new Error("Wait for the current edit to finish.");
    await this.waitForRendering();
    const key = [this.revision, format, quality].join(":");
    if (this.exportCache?.key === key) return this.exportCache.blob;
    const viewport = this.canvas.viewportTransform;
    let output: HTMLCanvasElement;
    try {
      this.canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
      output = this.canvas.toCanvasElement(1, {
        width: this.width,
        height: this.height,
        filter: (o) => o !== this.crop,
      });
    } finally {
      this.canvas.viewportTransform = viewport;
      this.canvas.calcViewportBoundaries();
    }
    try {
      if (format === "jpeg") {
        const ctx = output.getContext("2d")!;
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, output.width, output.height);
      }
      const blob = await encodeCanvas(output, "image/" + format, quality);
      if (key === [this.revision, format, quality].join(":"))
        this.exportCache = { key, blob };
      return blob;
    } finally {
      output.width = 0;
      output.height = 0;
    }
  }
  dispose() {
    this.renderer.dispose();
    clearTimeout(this.saveTimer);
    this.observer.disconnect();
    void this.canvas.dispose();
  }
}
export function validSize(w: number, h: number) {
  return (
    Number.isInteger(w) &&
    Number.isInteger(h) &&
    w > 0 &&
    h > 0 &&
    w <= 6000 &&
    h <= 6000 &&
    w * h <= 24000000
  );
}
export async function fileURL(file: File, sticker = false) {
  const valid = sticker
    ? ["image/png", "image/webp", "image/svg+xml"]
    : ["image/jpeg", "image/png", "image/webp"];
  if (!valid.includes(file.type))
    throw new Error(
      sticker
        ? "Choose a PNG, WebP or SVG sticker."
        : "Choose a JPEG, PNG or WebP photo.",
    );
  if (file.size > 80000000)
    throw new Error("Choose an image smaller than 80 MB.");
  if (file.type === "image/svg+xml") {
    const text = await file.text(),
      doc = new DOMParser().parseFromString(text, "image/svg+xml");
    if (
      doc.querySelector("parsererror,script,foreignObject,image,use,style") ||
      [...doc.querySelectorAll("*")].some((el) =>
        [...el.attributes].some(
          (a) =>
            /^on/i.test(a.name) ||
            /href/i.test(a.name) ||
            /url\s*\(/i.test(a.value),
        ),
      )
    )
      throw new Error(
        "This SVG includes unsupported embedded content. Use a simple SVG or PNG.",
      );
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("This file could not be read."));
    reader.readAsDataURL(file);
  });
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("eddict", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveProject(value: StoredProject) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(value, "last");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function loadProject() {
  const db = await database();
  return new Promise<StoredProject | undefined>((resolve, reject) => {
    const tx = db.transaction("projects"),
      req = tx.objectStore("projects").get("last");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export { FabricImage };
