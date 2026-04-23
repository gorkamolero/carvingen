import { expect, test } from "@playwright/test";

import { dropPaletteNode, waitForSaved } from "@/../tests/e2e/helpers";

test("keeps projects isolated when switching", async ({ page }) => {
  await page.goto("/");

  await dropPaletteNode(page, "prompt");
  await page.getByTestId("prompt-textarea").fill("First project prompt");
  await waitForSaved(page);

  const firstProjectName = await page.getByTestId("project-switcher").inputValue();

  await page.getByTestId("new-project-button").click();
  await expect(page.getByTestId("project-switcher").locator("option")).toHaveCount(2);
  await expect(page.getByTestId("prompt-node")).toHaveCount(0);

  await dropPaletteNode(page, "prompt");
  await page.getByTestId("prompt-textarea").fill("Second project prompt");
  await waitForSaved(page);

  await page.getByTestId("project-switcher").selectOption(firstProjectName);

  await expect(page.getByTestId("prompt-node")).toHaveCount(1);
  await expect(page.getByTestId("prompt-textarea")).toHaveValue("First project prompt");
});
