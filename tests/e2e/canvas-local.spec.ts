import { expect, test } from "@playwright/test";

import { dropPaletteNode, waitForSaved } from "@/../tests/e2e/helpers";

test("creates a prompt node, persists text, and restores after reload", async ({ page }) => {
  await page.goto("/");

  await dropPaletteNode(page, "prompt");
  await expect(page.getByTestId("prompt-node")).toHaveCount(1);

  await page.getByTestId("prompt-textarea").fill("A walnut raven carving with lunar motifs");
  await waitForSaved(page);

  await page.reload();

  await expect(page.getByTestId("prompt-node")).toHaveCount(1);
  await expect(page.getByTestId("prompt-textarea")).toHaveValue(
    "A walnut raven carving with lunar motifs",
  );
});
