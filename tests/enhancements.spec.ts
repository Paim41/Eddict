import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

async function photo(
  page: import("@playwright/test").Page,
  colour = "#9d785e",
  width = 640,
  height = 480,
) {
  const data = await page.evaluate(
    ({ colour, width, height }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#27252b";
      ctx.fillRect(width / 4, height / 4, width / 3, height / 3);
      return c.toDataURL().split(",")[1];
    },
    { colour, width, height },
  );
  return {
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  };
}
test("background renderer matches legacy pixels including blur and alpha", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { FabricImage, adjustmentFilters, defaults, presets } =
      await import("/src/editor.ts");
    const { FilterRenderer } = await import("/src/filter-renderer.ts");
    const { filters: legacyFilters } =
      await import("/node_modules/.vite/deps/fabric.js");
    const legacy = (values: any) =>
      adjustmentFilters(values).map((filter: any) => {
        if (filter.type !== "EddictSharpness") return filter;
        const a = filter.amount / 200;
        return new legacyFilters.Convolute({
          matrix: [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0],
        });
      });
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 96;
    const ctx = c.getContext("2d")!;
    const data = ctx.createImageData(128, 96);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i] = (i * 7) % 256;
      data.data[i + 1] = (i * 3) % 256;
      data.data[i + 2] = (i * 11) % 256;
      data.data[i + 3] = i % 20 === 0 ? 90 : 255;
    }
    ctx.putImageData(data, 0, 0);
    const img = await FabricImage.fromURL(c.toDataURL());
    const stack = [
      { id: "1", preset: "eddict-crystal" },
      { id: "2", preset: "black-aesthetic" },
      { id: "3", preset: "eddict-crystal" },
    ];
    const manual = {
      ...defaults(),
      blur: 2,
      vignette: 20,
      tint: 4,
      brightness: 3,
    };
    img.filters = [
      ...stack.flatMap((s) => legacy(presets[s.preset].adjustments)),
      ...legacy(manual),
    ];
    img.applyFilters();
    const expected = [
      ...img.toCanvasElement().getContext("2d")!.getImageData(0, 0, 128, 96)
        .data,
    ];
    const renderer = new FilterRenderer();
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    await renderer.render(img, stack, manual);
    clearInterval(timer);
    const actual = [
      ...img.toCanvasElement().getContext("2d")!.getImageData(0, 0, 128, 96)
        .data,
    ];
    await renderer.render(img, [], defaults());
    const original = img.getElement() === img._originalElement;
    renderer.dispose();
    return {
      same: expected.every((v, i) => v === actual[i]),
      original,
      ticks,
      max: Math.max(...expected.map((v, i) => Math.abs(v - actual[i]))),
      different: expected
        .map((v, i) => ({ i, v, a: actual[i] }))
        .filter((x) => x.v !== x.a)
        .slice(0, 10),
    };
  });
  expect(result.same).toBe(true);
  expect(result.original).toBe(true);
  expect(result.ticks).toBeGreaterThan(0);
});

test("locked base, before/after, replacement, undo and both transparent stickers", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(await photo(page));
  const canvas = page.locator("canvas.lower-canvas");
  const original = await canvas.evaluate((c: HTMLCanvasElement) =>
    c.toDataURL(),
  );
  const box = (await page.locator("canvas.upper-canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 80,
    box.y + box.height / 2 + 40,
    { steps: 6 },
  );
  await page.mouse.up();
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(
    original,
  );
  await page
    .getByRole("button", { name: "Add Eddict Crystal", exact: true })
    .click();
  await expect(page.locator(".editor-layout")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const edited = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  expect(edited).not.toBe(original);
  await page
    .getByRole("button", { name: "Before / After", exact: true })
    .click();
  const comparison = page.getByRole("slider", {
    name: "Before and after comparison",
  });
  await expect(comparison).toBeVisible();
  await comparison.fill("100");
  expect(
    await page
      .locator(".compare-original canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(original);
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(
    edited,
  );
  await page
    .getByRole("button", { name: "Before / After", exact: true })
    .click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unlock Base photo", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Replace photo", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(await photo(page, "#285b67", 480, 640));
  await expect(page.locator(".editor-layout")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".layer-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.locator(".applied-filters li")).toHaveCount(1);
  const replacement = await canvas.evaluate((c: HTMLCanvasElement) =>
    c.toDataURL(),
  );
  expect(replacement).not.toBe(edited);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".editor-layout")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(
    edited,
  );
  await page.getByRole("button", { name: "Stickers", exact: true }).click();
  await expect(page.locator(".custom-stickers>button")).toHaveCount(2);
  await page.getByRole("button", { name: "Add Paint", exact: true }).click();
  await expect(page.locator(".editor-layout")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page
    .getByRole("button", { name: "Add Hanaelliesh watermark", exact: true })
    .click();
  await expect(page.locator(".editor-layout")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.screenshot({ path: "test-results/stickers-desktop.png" });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(page.locator(".layer-row")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("capture gallery retains multiple native frames and downloads all as a ZIP", async ({
  page,
}) => {
  test.skip(!existsSync(".test-assets/sample.mp4"), "Optional fixture");
  await page.goto("/");
  await page.getByRole("button", { name: /Video to photo Keep/ }).click();
  await page
    .locator(".video-studio input[type=file]")
    .setInputFiles(".test-assets/sample.mp4");
  await expect(
    page.getByRole("button", { name: "Capture frame", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Capture frame", exact: true })
    .click();
  await expect(page.locator(".capture-card")).toHaveCount(1);
  await page
    .getByRole("spinbutton", { name: "Precise timestamp in seconds" })
    .fill("1");
  await expect(
    page.getByRole("button", { name: "Capture frame", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Capture frame", exact: true })
    .click();
  await expect(page.locator(".capture-card")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Download all (ZIP)", exact: true }),
  ).toBeEnabled();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download all (ZIP)", exact: true })
    .click();
  const zip = await readFile((await (await download).path())!);
  const files = Object.values(unzipSync(zip));
  expect(files).toHaveLength(2);
  for (const file of files) {
    const b = Buffer.from(file);
    expect(b.readUInt32BE(16)).toBe(640);
    expect(b.readUInt32BE(20)).toBe(360);
  }
  await page
    .getByRole("button", { name: "Edit capture 1", exact: true })
    .click();
  await expect(page.locator(".workspace-footer")).toContainText("640 × 360");
  await page
    .getByRole("button", { name: "Video to photo", exact: true })
    .click();
  await expect(page.locator(".capture-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Remove capture 1", exact: true })
    .click();
  await expect(page.locator(".capture-card")).toHaveCount(1);
});
