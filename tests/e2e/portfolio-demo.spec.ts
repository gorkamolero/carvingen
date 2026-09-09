import { expect, test } from "@playwright/test";

test("renders a public-safe read-only portfolio demo without provider or persistence calls", async ({ page }) => {
  const blockedRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("/api/projects") ||
      url.includes("/api/jobs") ||
      url.includes("/api/fal") ||
      url.includes("/api/assets/persist")
    ) {
      blockedRequests.push(url);
    }
  });

  await page.goto("/portfolio-demo");

  await expect(page.getByRole("heading", { name: "Carvingen public fixture" })).toBeVisible();
  await expect(page.getByTestId("portfolio-demo-flow")).toBeVisible();
  await expect(page.getByTestId("demo-image-node")).toBeVisible();
  await expect(page.getByTestId("demo-prompt-node")).toBeVisible();
  await expect(page.getByTestId("demo-mesh-node")).toBeVisible();
  await expect(page.getByTestId("demo-viewer-node")).toBeVisible();
  await expect(page.getByTestId("portfolio-demo-run-button")).toBeDisabled();
  await expect(page.getByTestId("portfolio-demo-mesh-run-button")).toBeDisabled();
  expect(blockedRequests).toEqual([]);
});
