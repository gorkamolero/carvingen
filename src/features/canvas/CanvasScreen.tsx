"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSnapshot } from "valtio";

import { CanvasFlow } from "@/features/canvas/flow/CanvasFlow";
import { HelpCheatsheet } from "@/features/canvas/help/HelpCheatsheet";
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
  const [helpOpen, setHelpOpen] = useState(false);

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
    mutationFn: () => {
      const existingCount = (projectsQuery.data?.length ?? 0) + 1;
      const defaultName = `Untitled ${existingCount}`;
      return fetchJson<ProjectGraph>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: defaultName }),
      });
    },
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
    <div className="flex h-screen flex-col bg-[#f4efdf] text-black">
      <ProjectSwitcher
        projects={projectItems}
        activeProjectId={graph.activeProjectId}
        onSelect={async (projectId) => {
          const project = await fetchJson<ProjectGraph>(`/api/projects/${projectId}`);
          hydrateProject(project);
        }}
        onCreate={() => createProjectMutation.mutate()}
        onRename={() => renameProjectMutation.mutate()}
        onOpenHelp={() => setHelpOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <SidebarPalette />
        <CanvasFlow />
      </div>
      <div
        data-testid="save-status"
        className="flex items-center justify-between gap-4 border-t-[3px] border-black bg-[#efe8cd] px-5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/60"
      >
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 ${
              graph.isSaving ? "bg-[#ffd400]" : graph.lastSavedAt ? "bg-[#8cff3e]" : "bg-black/30"
            }`}
            aria-hidden
          />
          {graph.isSaving ? "Saving" : graph.lastSavedAt ? "Saved" : "Ready"}
        </span>
        <span>⌘Z · Undo  ·  ⌘⇧Z · Redo</span>
      </div>
      {helpOpen && <HelpCheatsheet onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
