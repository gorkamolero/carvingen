import { fetchJson } from "@/lib/api/client";
import type { ProjectGraph } from "@/lib/graph/types";

export const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;

let pending: Promise<string> | undefined;

// Share the request across Strict Mode mounts; failures can be retried explicitly.
export function resolveHomeProject(): Promise<string> {
  if (pending) return pending;
  pending = (async () => {
    const projects = await fetchJson<Array<{ id: string; updatedAt: string }>>("/api/projects");
    const latest = projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))[0];
    if (latest) return projectPath(latest.id);
    const project = await fetchJson<ProjectGraph>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "Untitled project", initial: true }),
    });
    return projectPath(project.id);
  })().finally(() => { pending = undefined; });
  return pending;
}
