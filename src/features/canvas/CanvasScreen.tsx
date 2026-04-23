"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useSnapshot } from "valtio";

import { CanvasFlow } from "@/features/canvas/flow/CanvasFlow";
import { SidebarPalette } from "@/features/canvas/palette/SidebarPalette";
import { ProjectSwitcher } from "@/features/canvas/projects/ProjectSwitcher";
import { fetchJson } from "@/lib/api/client";
import {
  graphHistory,
  hydrateProject,
  markSaved,
  redo,
  setProjectName,
  setSaving,
  undo,
} from "@/lib/graph/store";
import type { ProjectGraph } from "@/lib/graph/types";

type ProjectListItem = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export function CanvasScreen() {
  const queryClient = useQueryClient();
  const graph = useSnapshot(graphHistory.value);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchJson<ProjectListItem[]>("/api/projects"),
  });

  const activeProjectQuery = useQuery({
    queryKey: ["project", graph.activeProjectId],
    queryFn: async () => {
      if (!graph.activeProjectId) {
        const created = await fetchJson<ProjectGraph>("/api/projects", {
          method: "POST",
          body: JSON.stringify({ name: "Untitled project" }),
        });
        return created;
      }

      return fetchJson<ProjectGraph>(`/api/projects/${graph.activeProjectId}`);
    },
    enabled: projectsQuery.isSuccess,
  });

  const createProjectMutation = useMutation({
    mutationFn: () =>
      fetchJson<ProjectGraph>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: `Project ${Date.now()}` }),
      }),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      hydrateProject(project);
    },
  });

  const renameProjectMutation = useMutation({
    mutationFn: async () => {
      if (!graph.activeProjectId) {
        throw new Error("No active project.");
      }

      const name = window.prompt("Rename project", graph.projectName);
      if (!name) {
        return null;
      }

      return fetchJson<ProjectGraph>(`/api/projects/${graph.activeProjectId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: async (project) => {
      if (!project) {
        return;
      }

      setProjectName(project.name);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  useEffect(() => {
    if (projectsQuery.data && projectsQuery.data.length > 0 && !graph.activeProjectId) {
      hydrateProject({
        ...(activeProjectQuery.data ?? {
          id: projectsQuery.data[0].id,
          name: projectsQuery.data[0].name,
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
      });
    }
  }, [activeProjectQuery.data, graph.activeProjectId, projectsQuery.data]);

  useEffect(() => {
    if (activeProjectQuery.data) {
      hydrateProject(activeProjectQuery.data);
    }
  }, [activeProjectQuery.data]);

  useEffect(() => {
    if (!graph.activeProjectId || !graph.projectsLoaded) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      setSaving(true);
      try {
        await fetchJson(`/api/projects/${graph.activeProjectId}/save`, {
          method: "POST",
          body: JSON.stringify({
            id: graph.activeProjectId,
            name: graph.projectName,
            nodes: graph.nodes,
            edges: graph.edges,
            viewport: graph.viewport,
          }),
        });
        markSaved();
        await queryClient.invalidateQueries({ queryKey: ["projects"] });
      } catch {
        setSaving(false);
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [
    graph.activeProjectId,
    graph.projectName,
    graph.nodes,
    graph.edges,
    graph.viewport,
    graph.projectsLoaded,
    queryClient,
  ]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const projectItems = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  return (
    <div className="flex h-screen flex-col bg-[#fafaf5] text-black">
      <ProjectSwitcher
        projects={projectItems}
        activeProjectId={graph.activeProjectId}
        onSelect={async (projectId) => {
          const project = await fetchJson<ProjectGraph>(`/api/projects/${projectId}`);
          hydrateProject(project);
        }}
        onCreate={() => createProjectMutation.mutate()}
        onRename={() => renameProjectMutation.mutate()}
      />
      <div className="flex min-h-0 flex-1">
        <SidebarPalette />
        <CanvasFlow />
      </div>
      <div data-testid="save-status" className="border-t-[3px] border-black bg-[#fff6d8] px-4 py-2 font-mono text-xs uppercase">
        {graph.isSaving ? "Saving…" : graph.lastSavedAt ? "Saved" : "Ready"}
      </div>
    </div>
  );
}
