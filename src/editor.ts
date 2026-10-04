import {
  Canvas,
  FabricImage,
  FabricObject,
  Rect,
  filters,
  classRegistry,
  setFilterBackend,
  Canvas2dFilterBackend,
} from "fabric";
import type { T2DPipelineState } from "fabric";
setFilterBackend(new Canvas2dFilterBackend());
export const adjustmentKeys = [
  "brightness",
  "contrast",
  "saturation",
  "exposure",
  "temperature",
  "tint",
  "highlights",
  "shadows",
  "sharpness",
  "blur",
  "fade",
  "vignette",
] as const;
export type Adjustment = (typeof adjustmentKeys)[number];
export type Adjustments = Record<Adjustment, number>;
export type Preset = "eddict-crystal" | "eddict-porcelain" | "black-aesthetic";
export interface FilterInstance {
  id: string;
  preset: Preset;
}
export const defaults = (): Adjustments =>
  Object.fromEntries(adjustmentKeys.map((k) => [k, 0])) as Adjustments;
export const presets: Record<
  Preset,
  { name: string; adjustments: Adjustments }
> = {
  "eddict-crystal": {
    name: "Eddict Crystal",
    adjustments: {
      brightness: 5,
      contrast: 9,
      saturation: -7,
      exposure: 5,
      temperature: -6,
      tint: 1,
      highlights: 6,
      shadows: 1,
      sharpness: 18,
      blur: 0,
      fade: 0,
      vignette: 0,
    },
  },
  "eddict-porcelain": {
    name: "Eddict Porcelain",
    adjustments: {
      brightness: 2,
      contrast: 5,
      saturation: -2,
      exposure: 2,
      temperature: -3,
      tint: 3,
      highlights: 3,
      shadows: -2,
      sharpness: 8,
      blur: 0,
      fade: 1,
      vignette: 0,
    },
  },
  "black-aesthetic": {
    name: "Black Aesthetic",
    adjustments: {
      brightness: -2,
      contrast: 6,
      saturation: -5,
      exposure: -2,
      temperature: -3,
      tint: 0,
      highlights: -7,
      shadows: -5,
      sharpness: 60,
      blur: 0,
      fade: 0,
      vignette: 0,
    },
  },
};
export function tonePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  a: Adjustments,
) {
  const exposure = 2 ** (a.exposure / 100),
    warmth = a.temperature * 0.32,
    tint = a.tint * 0.22;
  for (let i = 0; i < data.length; i += 4) {
    const l =
      (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
    const lift = a.shadows * (1 - l) ** 2 * 0.7 + a.highlights * l * l * 0.65;
    const x = (i / 4) % width,
      y = Math.floor(i / 4 / width);
    const edge = Math.min(
      1,
      ((x - width / 2) / (width / 2)) ** 2 +
        ((y - height / 2) / (height / 2)) ** 2,
    );
    const v = 1 - (a.vignette / 100) * edge * 0.8;
    for (let c = 0; c < 3; c++) {
      let value =
        data[i + c] * exposure +
        lift +
        (c === 0 ? warmth + tint : c === 1 ? -tint : -warmth + tint);
      value = value * (1 - a.fade / 180) + a.fade * 0.65;
      data[i + c] = value * v;
    }
  }
}
class EddictTone extends filters.BaseFilter<
  "EddictTone",
  { values: Adjustments }
> {
  static type = "EddictTone";
  static defaults = { values: defaults() };
  declare values: Adjustments;
  applyTo2d({ imageData }: T2DPipelineState) {
    tonePixels(imageData.data, imageData.width, imageData.height, this.values);
  }
  isNeutralState() {
    return [
      "exposure",
      "temperature",
      "tint",
      "highlights",
      "shadows",
      "fade",
      "vignette",
    ].every((k) => this.values[k as Adjustment] === 0);
  }
}
classRegistry.setClass(EddictTone);
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
// Each stage runs through precisely the same adjustment engine, in order.
// Never sum preset values: clipping and sharpening make that a different result.
export function adjustmentFilters(a: Adjustments): FabricImage["filters"] {
  const result: FabricImage["filters"] = [
    new EddictTone({ values: { ...a } }),
    new filters.Brightness({ brightness: a.brightness / 100 }),
    new filters.Contrast({ contrast: a.contrast / 100 }),
    new filters.Saturation({ saturation: a.saturation / 100 }),
  ];
  if (a.sharpness > 0) {
    const s = a.sharpness / 200;
    result.push(
      new filters.Convolute({
        matrix: [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0],
      }),
    );
  }
  if (a.blur > 0) result.push(new filters.Blur({ blur: a.blur / 150 }));
  return result;
}
export function applyLook(
  image: FabricImage,
  stack: FilterInstance[],
  manual: Adjustments,
) {
  image.filters = [
    ...stack.flatMap((instance) =>
      adjustmentFilters(presets[instance.preset].adjustments),
    ),
    ...adjustmentFilters(manual),
  ];
  image.applyFilters();
}
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
    this.cancelCrop();
    try {
      await this.canvas.loadFromJSON(s.canvas);
      for (const layer of this.layers) {
        layer.filterStack = (layer.filterStack || []).filter((f) =>
          Object.hasOwn(presets, f.preset),
        );
        layer.adjustments = { ...defaults(), ...layer.adjustments };
        if (layer instanceof FabricImage)
          applyLook(layer, layer.filterStack, layer.adjustments);
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
  ) {
    const image = await FabricImage.fromURL(url);
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
    clone.set({ left: o.left + 24, top: o.top + 24 });
    this.canvas.add(clone);
    this.canvas.setActiveObject(clone);
    this.commit();
  }
  toggleLock(o: Layer) {
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
  look(stack: FilterInstance[], adjustments: Adjustments, commit = true) {
    const o = this.selected;
    if (!(o instanceof FabricImage)) return;
    o.filterStack = stack.map((f) => ({ ...f }));
    o.adjustments = { ...adjustments };
    applyLook(o, o.filterStack, adjustments);
    this.canvas.requestRenderAll();
    if (commit) this.commit();
    else this.notify();
  }
  addFilter(preset: Preset) {
    const o = this.selected;
    if (!o) return;
    this.look(
      [...(o.filterStack || []), { id: crypto.randomUUID(), preset }],
      o.adjustments,
    );
  }
  removeFilter(id: string) {
    const o = this.selected;
    if (o)
      this.look(
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
    this.look(stack, o.adjustments);
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
    const viewport = this.canvas.viewportTransform.slice() as [
        number,
        number,
        number,
        number,
        number,
        number,
      ],
      dims = { width: this.canvas.width, height: this.canvas.height };
    let output: HTMLCanvasElement;
    try {
      this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      this.canvas.setDimensions({ width: this.width, height: this.height });
      output = this.canvas.toCanvasElement(1, {
        filter: (o) => o !== this.crop,
      });
    } finally {
      this.canvas.setDimensions(dims);
      this.canvas.setViewportTransform(viewport);
      this.canvas.requestRenderAll();
    }
    if (format === "jpeg") {
      const ctx = output.getContext("2d")!;
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, output.width, output.height);
    }
    return new Promise<Blob>((resolve, reject) =>
      output.toBlob(
        (blob) => {
          output.width = 0;
          output.height = 0;
          if (blob) resolve(blob);
          else reject(new Error("Export failed. Try a smaller canvas."));
        },
        "image/" + format,
        quality,
      ),
    );
  }
  dispose() {
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
