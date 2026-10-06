import { test, expect } from "@playwright/test";
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
test("mobile grid, proportional size presets and touch sticker transforms", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 480;
    const x = c.getContext("2d")!;
    x.fillStyle = "#a08070";
    x.fillRect(0, 0, 640, 480);
    return c.toDataURL().split(",")[1];
  });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(page.locator(".editor-layout")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const canvas = page.locator("canvas.lower-canvas");
  const before = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByRole("button", { name: "Grid", exact: true }).tap();
  await expect(page.getByLabel("Rule of thirds grid")).toBeVisible();
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(
    before,
  );
  await page.getByRole("button", { name: "Crop & resize", exact: true }).tap();
  await page.getByLabel("Width (px)").fill("800");
  await expect(page.getByLabel("Height (px)")).toHaveValue("600");
  await page.getByLabel("Quick sizes").selectOption("1080x1920");
  await expect(page.getByLabel("Height (px)")).toHaveValue("810");
  await page.getByLabel("Maintain aspect ratio").uncheck();
  await page.getByLabel("Quick sizes").selectOption("1080x1080");
  await expect(page.getByLabel("Height (px)")).toHaveValue("1080");
  await page.getByRole("button", { name: "Stickers", exact: true }).tap();
  await page.getByRole("button", { name: "Add Paint", exact: true }).tap();
  await expect(page.getByLabel("Sticker size")).toBeVisible();
  await page.getByLabel("Sticker size").fill("65");
  await page.getByLabel("Sticker rotation").fill("30");
  await page.getByRole("button", { name: "Lock size", exact: true }).tap();
  await expect(page.getByLabel("Sticker size")).toBeDisabled();
  // Drag the center with native touch events; locked size still allows position changes.
  const box = (await page.locator("canvas.upper-canvas").boundingBox())!;
  const client = await context.newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 20, y: y + 12 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.getByLabel("Sticker size")).toHaveValue("65");
  await expect(page.getByLabel("Sticker rotation")).toHaveValue("30");
  await page.getByRole("button", { name: "Reset rotation", exact: true }).tap();
  await expect(page.getByLabel("Sticker rotation")).toHaveValue("0");
  await page.screenshot({
    path: "test-results/mobile-transform.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Saved lock survives recovery.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { loadProject } = await import("/src/editor.ts");
        const saved = await loadProject();
        return saved?.current.canvas.objects.find(
          (o: any) => o.layerType === "sticker",
        )?.sizeLocked;
      }),
    )
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Resume your last edit" }).tap();
  await page.getByRole("button", { name: "Layers", exact: true }).tap();
  await page.locator(".layer-select").filter({ hasText: "Paint" }).tap();
  await expect(page.getByLabel("Sticker size")).toBeDisabled();
});
