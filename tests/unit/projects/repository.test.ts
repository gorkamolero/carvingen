// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const directory = mkdtempSync(join(tmpdir(), "carvingen-projects-"));
vi.stubEnv("DATABASE_PATH", join(directory, "test.sqlite"));
const { getOrCreateInitialProject, listProjects, createProject, loadProject } = await import("@/lib/db/repositories/projects");
const { db } = await import("@/lib/db/client");
const { projects } = await import("@/lib/db/schema");
afterAll(() => {
  db.$client.close();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it("atomically creates once, chooses latest updated and never creates for unknown IDs", async () => {
  const initial = await Promise.all(Array.from({ length: 8 }, () => getOrCreateInitialProject()));
  expect(new Set(initial.map((project) => project.id)).size).toBe(1);
  expect(await listProjects()).toHaveLength(1);
  await createProject("Newer creation");
  db.update(projects).set({ updatedAt: new Date(Date.now() + 10000) }).where(eq(projects.id, initial[0].id)).run();
  expect((await getOrCreateInitialProject()).id).toBe(initial[0].id);
  await expect(loadProject("missing")).rejects.toMatchObject({ status: 404 });
  expect(await listProjects()).toHaveLength(2);
});
