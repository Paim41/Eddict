import { FabricImage, filters, classRegistry } from "fabric";
import type { T2DPipelineState } from "fabric";
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
    let v = 1;
    if (a.vignette) {
      const x = (i / 4) % width,
        y = Math.floor(i / 4 / width);
      const edge = Math.min(
        1,
        ((x - width / 2) / (width / 2)) ** 2 +
          ((y - height / 2) / (height / 2)) ** 2,
      );
      v = 1 - (a.vignette / 100) * edge * 0.8;
    }
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
class EddictSharpness extends filters.BaseFilter<
  "EddictSharpness",
  { amount: number }
> {
  static type = "EddictSharpness";
  static defaults = { amount: 0 };
  declare amount: number;
  applyTo2d(state: T2DPipelineState) {
    const { data, width, height } = state.imageData;
    const output = state.ctx.createImageData(width, height),
      dst = output.data,
      s = this.amount / 200,
      row = width * 4;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          let v = 0;
          if (y > 0) v += data[i - row + c] * -s;
          if (x > 0) v += data[i - 4 + c] * -s;
          v += data[i + c] * (1 + 4 * s);
          if (x < width - 1) v += data[i + 4 + c] * -s;
          if (y < height - 1) v += data[i + row + c] * -s;
          dst[i + c] = v;
        }
      }
    state.imageData = output;
  }
  isNeutralState() {
    return this.amount === 0;
  }
}
classRegistry.setClass(EddictSharpness);
// Each stage runs through precisely the same adjustment engine, in order.
// Never sum preset values: clipping and sharpening make that a different result.
export function adjustmentFilters(a: Adjustments): FabricImage["filters"] {
  const result: FabricImage["filters"] = [
    new EddictTone({ values: { ...a } }),
    new filters.Brightness({ brightness: a.brightness / 100 }),
    new filters.Contrast({ contrast: a.contrast / 100 }),
    new filters.Saturation({ saturation: a.saturation / 100 }),
  ];
  if (a.sharpness > 0)
    result.push(new EddictSharpness({ amount: a.sharpness }));
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
