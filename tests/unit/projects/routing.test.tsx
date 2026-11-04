import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectSwitcher } from "@/features/canvas/projects/ProjectSwitcher";
import { resolveHomeProject } from "@/lib/projects/routing";
import { fetchJson } from "@/lib/api/client";
import ProjectPage from "@/app/projects/[id]/page";
import { loadProject } from "@/lib/db/repositories/projects";
import { ApiError } from "@/lib/http/errors";

const { push, notFound } = vi.hoisted(() => ({ push: vi.fn(), notFound: vi.fn(() => { throw new Error("404"); }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), notFound }));
vi.mock("@/lib/api/client", () => ({ fetchJson: vi.fn() }));
vi.mock("@/lib/db/repositories/projects", () => ({ loadProject: vi.fn() }));
vi.mock("@/features/canvas/CanvasScreen", () => ({ CanvasScreen: () => null }));
beforeEach(() => vi.clearAllMocks());

it("chooses latest updated, not list order, without creating", async () => {
  vi.mocked(fetchJson).mockResolvedValueOnce([
    { id: "old", updatedAt: "2026-01-01" }, { id: "latest", updatedAt: "2026-11-03" },
  ]);
  expect(await resolveHomeProject()).toBe("/projects/latest");
  expect(fetchJson).toHaveBeenCalledTimes(1);
});

it("shares one initial POST across simultaneous Strict Mode loads", async () => {
  vi.mocked(fetchJson).mockResolvedValueOnce([]).mockResolvedValueOnce({ id: "first" });
  expect(await Promise.all([resolveHomeProject(), resolveHomeProject()])).toEqual(["/projects/first", "/projects/first"]);
  expect(fetchJson).toHaveBeenCalledTimes(2);
  expect(fetchJson).toHaveBeenLastCalledWith("/api/projects", {
    method: "POST", body: JSON.stringify({ name: "Untitled project", initial: true }),
  });
  vi.mocked(fetchJson).mockResolvedValueOnce([{ id: "first", updatedAt: "2026-11-03" }]);
  expect(await resolveHomeProject()).toBe("/projects/first");
  expect(fetchJson).toHaveBeenCalledTimes(3);
});

it("unknown project returns not found without creating", async () => {
  vi.mocked(loadProject).mockRejectedValueOnce(new ApiError(404, "Project not found."));
  await expect(ProjectPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("404");
  expect(notFound).toHaveBeenCalledOnce();
  expect(fetchJson).not.toHaveBeenCalled();
});

it("switcher pushes the selected project URL", () => {
  render(<ProjectSwitcher projects={[{ id: "one", name: "One", updatedAt: "" }, { id: "two", name: "Two", updatedAt: "" }]}
    activeProjectId="one" onCreate={vi.fn()} onRename={vi.fn()} onOpenHelp={vi.fn()} />);
  fireEvent.change(screen.getByTestId("project-switcher"), { target: { value: "two" } });
  expect(push).toHaveBeenCalledWith("/projects/two");
});
