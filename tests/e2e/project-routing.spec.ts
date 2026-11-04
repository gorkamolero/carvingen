import { expect, test } from "@playwright/test";
import { dropPaletteNode, waitForSaved } from "./helpers";

test("project routes persist graphs, viewport and history without duplicate creation", async ({ page, request }) => {
  let creates = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/projects") creates++;
  });
  const before = await (await request.get("/api/projects")).json();
  await page.goto("/");
  await expect(page).toHaveURL(/\/projects\/[^/?]+$/);
  const firstUrl = page.url();
  const firstId = await page.getByTestId("project-switcher").inputValue();
  expect(creates).toBe(before.length ? 0 : 1);
  await page.reload();
  await expect(page.getByTestId("project-switcher")).toHaveValue(firstId);
  await page.goto("/");
  await expect(page).toHaveURL(firstUrl);
  expect((await (await request.get("/api/projects")).json()).length).toBe(Math.max(1, before.length));
  expect(creates).toBe(before.length ? 0 : 1);

  await dropPaletteNode(page, "prompt");
  await page.getByTestId("prompt-textarea").fill("Routing saved prompt");
  await waitForSaved(page, "Routing saved prompt");
  const graph = await (await request.get(`/api/projects/${firstId}`)).json();
  graph.viewport = { x: 123, y: 84, zoom: 0.75 };
  await request.post(`/api/projects/${firstId}/save`, { data: graph });
  await page.reload();
  await expect(page.getByTestId("prompt-textarea")).toHaveValue("Routing saved prompt");
  await expect(page.locator(".react-flow__viewport")).toHaveCSS("transform", "matrix(0.75, 0, 0, 0.75, 123, 84)");

  await page.getByTestId("new-project-button").click();
  await expect(page).not.toHaveURL(firstUrl);
  const secondUrl = page.url();
  await expect(page.getByTestId("prompt-node")).toHaveCount(0);
  await expect(page.getByTestId("canvas-flow")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(firstUrl);
  await expect(page.getByTestId("prompt-textarea")).toHaveValue("Routing saved prompt");
  await page.goForward();
  await expect(page).toHaveURL(secondUrl);
  await expect(page.getByTestId("prompt-node")).toHaveCount(0);
  await page.getByTestId("project-switcher").selectOption(firstId);
  await expect(page).toHaveURL(firstUrl);
  await expect(page.getByTestId("prompt-textarea")).toHaveValue("Routing saved prompt");
  await page.goto(`${firstUrl}?node=${graph.nodes[0].id}`);
  await expect(page.locator(`.react-flow__node[data-id="${graph.nodes[0].id}"]`)).toHaveClass(/selected/);

  const count = (await (await request.get("/api/projects")).json()).length;
  await page.goto("/projects/does-not-exist");
  await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to projects" })).toHaveAttribute("href", "/");
  expect((await (await request.get("/api/projects")).json()).length).toBe(count);
});
