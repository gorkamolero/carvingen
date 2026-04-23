import { expect, test } from "@playwright/test";

test("loads the canvas shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("project-switcher")).toBeVisible();
  await expect(page.getByTestId("palette-image")).toBeVisible();
  await expect(page.getByTestId("palette-prompt")).toBeVisible();
  await expect(page.getByTestId("palette-vision")).toBeVisible();
});
