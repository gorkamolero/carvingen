import { expect, test } from "@playwright/test";

import { connectHandles, dropImageFile, dropPaletteNode } from "@/../tests/e2e/helpers";

test.skip(
  !process.env.FAL_KEY || !process.env.PUBLIC_URL,
  "FAL_KEY and PUBLIC_URL are required for reference-image and mesh provider flows.",
);

test("uploads a reference image, runs prompt generation, and sends it into Mesh", async ({
  page,
}) => {
  test.setTimeout(360_000);

  await page.goto("/");

  await dropImageFile(page);
  await expect(page.getByTestId("image-node")).toHaveCount(1);

  await dropPaletteNode(page, "prompt", { x: 700, y: 260 });
  await dropPaletteNode(page, "mesh", { x: 1040, y: 260 });

  await connectHandles(
    page,
    page.getByTestId("image-node").getByTestId("image-out-handle"),
    page.getByTestId("prompt-node").getByTestId("prompt-image-in"),
  );

  await page
    .getByTestId("prompt-node")
    .getByTestId("prompt-textarea")
    .fill("Transform this into a carved walnut totem concept");
  await page.getByTestId("prompt-node").getByTestId("run-button").click();

  await expect(page.locator("[data-testid='prompt-node'] img[alt='Latest output']")).toBeVisible({
    timeout: 180_000,
  });

  await connectHandles(
    page,
    page.getByTestId("prompt-node").getByTestId("prompt-image-out"),
    page.getByTestId("mesh-node").getByTestId("mesh-image-in"),
  );

  await page.getByTestId("mesh-run-button").click();
  await expect(page.getByTestId("mesh-node").getByRole("link", { name: /glb/i })).toBeVisible({
    timeout: 360_000,
  });
});
