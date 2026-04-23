import { expect, test } from "@playwright/test";

import { dropPaletteNode } from "@/../tests/e2e/helpers";

test.skip(!process.env.FAL_KEY, "FAL_KEY is required for provider-backed image generation.");

test("runs a real prompt generation through the UI", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/");
  await dropPaletteNode(page, "prompt");

  await page.getByTestId("prompt-textarea").fill(
    "A carved walnut raven totem on a cream studio background",
  );
  await page.getByTestId("run-button").click();

  await expect(page.locator("[data-testid='prompt-node'] img[alt='Latest output']")).toBeVisible({
    timeout: 180_000,
  });
});
