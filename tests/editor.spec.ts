import { test, expect } from "@playwright/test";

async function upload(page: import("@playwright/test").Page) {
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 480;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 640, 480);
    g.addColorStop(0, "#301a35");
    g.addColorStop(0.5, "#b58f75");
    g.addColorStop(1, "#f5e8e2");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = "#507350";
    ctx.fillRect(70, 60, 180, 140);
    return c.toDataURL().split(",")[1];
  });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "test-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(
    page.getByRole("button", { name: "Add Eddict Crystal", exact: true }),
  ).toBeVisible();
}

test("sequential filters match repeated Adjust passes, preserve alpha, and serialize", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { FabricImage, applyLook, defaults, presets } =
      await import("/src/editor.ts");
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 24;
    const ctx = c.getContext("2d")!;
    const pixels = ctx.createImageData(32, 24);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = (i * 7) % 256;
      pixels.data[i + 1] = (i * 3) % 256;
      pixels.data[i + 2] = (i * 11) % 256;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const source = c.toDataURL();
    const stack = [
      { id: "1", preset: "eddict-crystal" },
      { id: "2", preset: "eddict-porcelain" },
      { id: "3", preset: "eddict-crystal" },
    ];
    const combined = await FabricImage.fromURL(source);
    applyLook(combined, stack, { ...defaults(), brightness: 7 });
    let sequential = await FabricImage.fromURL(source);
    for (const stage of [
      ...stack.map((f) => presets[f.preset].adjustments),
      { ...defaults(), brightness: 7 },
    ]) {
      applyLook(sequential, [], stage);
      sequential = await FabricImage.fromURL(sequential.toDataURL());
    }
    const bytes = (image: any) => {
      const canvas = image.toCanvasElement();
      return [...canvas.getContext("2d")!.getImageData(0, 0, 32, 24).data];
    };
    const once = await FabricImage.fromURL(source);
    applyLook(once, [stack[0]], defaults());
    const twice = await FabricImage.fromURL(source);
    applyLook(twice, [stack[0], stack[0]], defaults());
    const clone = await combined.clone();
    return {
      equivalent:
        JSON.stringify(bytes(combined)) === JSON.stringify(bytes(sequential)),
      repeatChanges:
        JSON.stringify(bytes(once)) !== JSON.stringify(bytes(twice)),
      cloneMatches:
        JSON.stringify(bytes(combined)) === JSON.stringify(bytes(clone)),
      alpha: bytes(combined)
        .filter((_: number, i: number) => i % 4 === 3)
        .every((v) => v === 0 || v === 255),
      values: presets,
    };
  });
  expect(result.equivalent).toBe(true);
  expect(result.repeatChanges).toBe(true);
  expect(result.cloneMatches).toBe(true);
  expect(result.alpha).toBe(true);
  expect(result.values["eddict-crystal"].adjustments).toEqual({
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
  });
});

test("UI stack supports repeats, removal, undo, recovery, layers and full-size export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await upload(page);
  await page
    .getByRole("button", { name: "Add Eddict Crystal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Eddict Porcelain", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Eddict Crystal", exact: true })
    .click();
  await expect(page.locator(".applied-filters li")).toHaveCount(3);
  await expect(page.locator(".applied-filters li").nth(2)).toContainText(
    "Eddict Crystal",
  );
  await page
    .getByRole("button", {
      name: "Remove filter 2 Eddict Porcelain",
      exact: true,
    })
    .click();
  await expect(page.locator(".applied-filters li")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".applied-filters li")).toHaveCount(3);
  await page.getByRole("button", { name: "Adjust", exact: true }).click();
  await page.getByRole("slider", { name: "Brightness", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.locator(".applied-filters li")).toHaveCount(3);
  await page.waitForTimeout(700);
  await page.reload();
  await page.getByRole("button", { name: "Resume your last edit" }).click();
  await expect(page.locator(".applied-filters li")).toHaveCount(3);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".layer-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".layer-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export image", exact: true }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile(path!);
  expect(bytes.readUInt32BE(16)).toBe(640);
  expect(bytes.readUInt32BE(20)).toBe(480);
  await page
    .getByRole("button", { name: "Crop & resize", exact: true })
    .click();
  await page.getByRole("button", { name: "1:1", exact: true }).click();
  await page.getByRole("button", { name: "Apply crop", exact: true }).click();
  const dimensions = await page
    .locator(".workspace-footer>span")
    .first()
    .textContent();
  expect(dimensions).toMatch(/409 × 409/);
  expect(errors).toEqual([]);
});

test("Sakura is bounded, behind controls, and respects reduced motion; mobile stays usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".sakura").first()).toBeAttached();
  expect(await page.locator(".sakura").count()).toBeLessThanOrEqual(200);
  expect(
    await page
      .locator("#sakura-container")
      .evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe("none");
  await upload(page);
  await expect(
    page.getByRole("button", { name: "Add Eddict Crystal", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add Eddict Crystal", exact: true })
    .click();
  await expect(page.locator(".applied-filters li")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".sakura")).toHaveCount(0);
});
