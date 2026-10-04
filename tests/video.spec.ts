import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
test("native-resolution video capture, PNG/JPG download and edit handoff", async ({
  page,
}) => {
  test.skip(
    !existsSync(".test-assets/sample.mp4"),
    "Generate the optional video fixture using the README command.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Video to photo Keep/ }).click();
  await page
    .locator(".video-studio input[type=file]")
    .setInputFiles(".test-assets/sample.mp4");
  await expect(
    page.getByRole("button", { name: "Capture frame", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("spinbutton", { name: "Precise timestamp in seconds" })
    .fill("1.000");
  await expect(
    page.getByRole("button", { name: "Capture frame", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Capture frame", exact: true })
    .click();
  await expect(page.locator(".capture-preview")).toBeVisible();
  expect(
    await page
      .locator(".capture-preview")
      .evaluate((img: HTMLImageElement) => [
        img.naturalWidth,
        img.naturalHeight,
      ]),
  ).toEqual([640, 360]);
  const png = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  const path = await (await png).path();
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile(path!);
  expect(bytes.readUInt32BE(16)).toBe(640);
  expect(bytes.readUInt32BE(20)).toBe(360);
  await page.getByLabel("Format", { exact: true }).selectOption("jpeg");
  const jpg = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JPG", exact: true }).click();
  expect((await jpg).suggestedFilename()).toMatch(/\.jpg$/);
  await page
    .getByRole("button", { name: "Edit in Eddict", exact: true })
    .click();
  await expect(page.locator(".workspace-footer")).toContainText("640 × 360 px");
  await expect(page.locator(".applied-filters li")).toHaveCount(0);
});
