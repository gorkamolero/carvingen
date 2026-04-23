import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/lib/db/client";
import { ensureDatabase } from "@/lib/db/init";
import { jobs } from "@/lib/db/schema";
import { ApiError } from "@/lib/http/errors";

export type CreateJobInput = {
  projectId: string;
  nodeId: string;
  provider: "fal";
  providerJobId: string;
  providerSlug: string;
  requestInput: object;
};

export async function createJob(input: CreateJobInput) {
  ensureDatabase();
  const id = nanoid();

  await db.insert(jobs).values({
    id,
    projectId: input.projectId,
    nodeId: input.nodeId,
    provider: input.provider,
    providerJobId: input.providerJobId,
    providerSlug: input.providerSlug,
    state: "queued",
    requestJson: JSON.stringify(input.requestInput),
    startedAt: new Date(),
  });

  return { jobId: id };
}

export async function getActiveJobsByProject(projectId: string) {
  ensureDatabase();
  const rows = await db.query.jobs.findMany({
    where: and(eq(jobs.projectId, projectId), inArray(jobs.state, ["queued", "running"])),
    orderBy: (table, { desc }) => [desc(table.startedAt)],
  });

  return rows.map((row) => ({
    id: row.id,
    nodeId: row.nodeId,
    providerJobId: row.providerJobId,
    providerSlug: row.providerSlug,
    state: row.state as "queued" | "running",
    startedAt: row.startedAt.toISOString(),
  }));
}

export async function getJobById(id: string) {
  ensureDatabase();
  return db.query.jobs.findFirst({ where: eq(jobs.id, id) });
}

export async function markJobRunning(id: string) {
  ensureDatabase();
  await db.update(jobs).set({ state: "running" }).where(eq(jobs.id, id));
}

export async function completeJob(input: {
  id: string;
  state: "succeeded" | "failed" | "canceled";
  responseSummary?: object;
  outputAssetIds?: string[];
  error?: string;
}) {
  ensureDatabase();
  const existing = await getJobById(input.id);

  if (!existing) {
    throw new ApiError(404, "Job not found.");
  }

  if (["succeeded", "failed", "canceled"].includes(existing.state)) {
    throw new ApiError(409, "Job is already complete.");
  }

  await db
    .update(jobs)
    .set({
      state: input.state,
      responseSummaryJson: input.responseSummary
        ? JSON.stringify(input.responseSummary)
        : null,
      outputAssetIdsJson: input.outputAssetIds
        ? JSON.stringify(input.outputAssetIds)
        : null,
      error: input.error ?? null,
      completedAt: new Date(),
    })
    .where(eq(jobs.id, input.id));

  return getJobById(input.id);
}
