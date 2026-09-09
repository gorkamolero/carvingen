import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0nQAAAAASUVORK5CYII=";

export async function dropPaletteNode(
  page: Page,
  nodeType: "prompt" | "image" | "mesh" | "viewer" | "vision",
  point: { x: number; y: number } = { x: 360, y: 240 },
) {
  await page.waitForLoadState("networkidle");
  await page.getByTestId("canvas-flow").evaluate(
    (element, payload) => {
      const transfer = new DataTransfer();
      transfer.setData("application/carvingen-node", JSON.stringify({ nodeType: payload.nodeType }));
      for (const type of ["dragover", "drop"]) {
        element.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: payload.point.x,
            clientY: payload.point.y,
            dataTransfer: transfer,
          }),
        );
      }
    },
    { nodeType, point },
  );
  await page.getByRole("button", { name: "Fit View" }).click();
}

export async function dropImageFile(
  page: Page,
  name = "reference.png",
  point: { x: number; y: number } = { x: 360, y: 260 },
) {
  const bytes = [...Buffer.from(tinyPngBase64, "base64")];
  const dataTransfer = await page.evaluateHandle(
    ({ fileName, fileBytes }) => {
      const transfer = new DataTransfer();
      const file = new File([new Uint8Array(fileBytes)], fileName, { type: "image/png" });
      transfer.items.add(file);
      return transfer;
    },
    { fileName: name, fileBytes: bytes },
  );

  await page.dispatchEvent("[data-testid='canvas-flow']", "drop", {
    dataTransfer,
    clientX: point.x,
    clientY: point.y,
  });
}

export async function waitForSaved(page: Page, expectedText?: string) {
  await page.waitForResponse(
    (response) => {
      const request = response.request();
      return (
        request.method() === "POST" &&
        response.url().includes("/api/projects/") &&
        response.url().endsWith("/save") &&
        response.ok() &&
        (!expectedText || (request.postData() ?? "").includes(expectedText))
      );
    },
  );
  await expect(page.getByTestId("save-status")).toHaveText(/Saved|Ready/);
}

export async function connectHandles(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error("Unable to locate handle bounding boxes.");
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
}
