import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/lib/db/client";
import { ensureDatabase } from "@/lib/db/init";
import { edges, nodes, projects } from "@/lib/db/schema";
import {
  deserializeEdge,
  deserializeNode,
  serializeNode,
} from "@/lib/graph/serialization";
import type { CarvingNode, ProjectGraph } from "@/lib/graph/types";
import { ApiError } from "@/lib/http/errors";

export async function listProjects() {
  ensureDatabase();
  const rows = await db.query.projects.findMany({
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createProject(name: string) {
  ensureDatabase();
  const id = nanoid();
  const now = new Date();

  await db.insert(projects).values({
    id,
    name,
    createdAt: now,
    updatedAt: now,
    viewportX: 0,
    viewportY: 0,
    viewportZoom: 1,
  });

  return loadProject(id);
}

export async function renameProject(id: string, name: string) {
  ensureDatabase();
  await db
    .update(projects)
    .set({ name, updatedAt: new Date() })
    .where(eq(projects.id, id));

  return loadProject(id);
}

export async function loadProject(id: string): Promise<ProjectGraph> {
  ensureDatabase();

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  });

  if (!project) {
    throw new ApiError(404, "Project not found.");
  }

  const nodeRows = await db.query.nodes.findMany({
    where: eq(nodes.projectId, id),
  });
  const edgeRows = await db.query.edges.findMany({
    where: eq(edges.projectId, id),
  });

  return {
    id: project.id,
    name: project.name,
    nodes: nodeRows.map((row) =>
      deserializeNode({
        id: row.id,
        type: row.type as CarvingNode["type"],
        positionX: row.positionX,
        positionY: row.positionY,
        dataJson: row.dataJson,
      }),
    ),
    edges: edgeRows.map(deserializeEdge),
    viewport: {
      x: project.viewportX,
      y: project.viewportY,
      zoom: project.viewportZoom,
    },
  };
}

export async function saveProjectGraph(input: ProjectGraph) {
  ensureDatabase();

  const existing = await db.query.projects.findFirst({
    where: eq(projects.id, input.id),
  });

  if (!existing) {
    throw new ApiError(404, "Project not found.");
  }

  db.transaction((tx) => {
    tx.update(projects)
      .set({
        name: input.name,
        viewportX: input.viewport.x,
        viewportY: input.viewport.y,
        viewportZoom: input.viewport.zoom,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, input.id))
      .run();

    tx.delete(nodes).where(eq(nodes.projectId, input.id)).run();
    tx.delete(edges).where(eq(edges.projectId, input.id)).run();

    if (input.nodes.length) {
      tx.insert(nodes)
        .values(
          input.nodes.map((node) => ({
            ...serializeNode(node),
            projectId: input.id,
            type: node.type,
          })),
        )
        .run();
    }

    if (input.edges.length) {
      tx.insert(edges)
        .values(
          input.edges.map((edge) => ({
            id: edge.id,
            projectId: input.id,
            source: edge.source,
            sourceHandle: edge.sourceHandle ?? "",
            target: edge.target,
            targetHandle: edge.targetHandle ?? "",
            dataJson: JSON.stringify(edge.data ?? {}),
          })),
        )
        .run();
    }
  });

  return loadProject(input.id);
}

export async function getOrCreateInitialProject() {
  ensureDatabase();
  const mostRecent = await db.query.projects.findFirst({
    orderBy: (table, { desc }) => [desc(table.updatedAt)],
  });

  if (mostRecent) {
    return loadProject(mostRecent.id);
  }

  return createProject("Untitled project");
}
