import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  viewportX: real("viewport_x").notNull().default(0),
  viewportY: real("viewport_y").notNull().default(0),
  viewportZoom: real("viewport_zoom").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const nodes = sqliteTable(
  "nodes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    type: text("type").notNull(),
    positionX: real("position_x").notNull(),
    positionY: real("position_y").notNull(),
    dataJson: text("data_json").notNull(),
  },
  (table) => ({
    projectIdIdx: index("nodes_project_id_idx").on(table.projectId),
  }),
);

export const edges = sqliteTable(
  "edges",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    source: text("source").notNull(),
    sourceHandle: text("source_handle").notNull(),
    target: text("target").notNull(),
    targetHandle: text("target_handle").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
  },
  (table) => ({
    projectIdIdx: index("edges_project_id_idx").on(table.projectId),
  }),
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    nodeId: text("node_id").notNull(),
    provider: text("provider").notNull().default("fal"),
    providerJobId: text("provider_job_id").notNull(),
    providerSlug: text("provider_slug").notNull(),
    state: text("state").notNull(),
    requestJson: text("request_json").notNull(),
    responseSummaryJson: text("response_summary_json"),
    outputAssetIdsJson: text("output_asset_ids_json"),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => ({
    projectIdIdx: index("jobs_project_id_idx").on(table.projectId),
    nodeIdIdx: index("jobs_node_id_idx").on(table.nodeId),
    providerJobIdIdx: uniqueIndex("jobs_provider_job_id_idx").on(table.providerJobId),
  }),
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id"),
    kind: text("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    localPath: text("local_path").notNull(),
    sourceUrl: text("source_url"),
    sha256: text("sha256").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    originalFileName: text("original_file_name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    jobIdIdx: index("assets_job_id_idx").on(table.jobId),
    shaIdx: uniqueIndex("assets_sha_bytes_idx").on(table.sha256, table.bytes),
  }),
);
