import Database from "better-sqlite3";

import { getServerEnv } from "@/lib/env";

let initialized = false;

export function ensureDatabase() {
  if (initialized) {
    return;
  }

  const env = getServerEnv();
  const sqlite = new Database(env.DATABASE_PATH);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      viewport_x REAL NOT NULL DEFAULT 0,
      viewport_y REAL NOT NULL DEFAULT 0,
      viewport_zoom REAL NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      position_x REAL NOT NULL,
      position_y REAL NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS nodes_project_id_idx ON nodes(project_id);

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_handle TEXT NOT NULL,
      target TEXT NOT NULL,
      target_handle TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS edges_project_id_idx ON edges(project_id);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'fal',
      provider_job_id TEXT NOT NULL,
      provider_slug TEXT NOT NULL,
      state TEXT NOT NULL,
      request_json TEXT NOT NULL,
      response_summary_json TEXT,
      output_asset_ids_json TEXT,
      error TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_provider_job_id_idx ON jobs(provider_job_id);
    CREATE INDEX IF NOT EXISTS jobs_project_id_idx ON jobs(project_id);
    CREATE INDEX IF NOT EXISTS jobs_node_id_idx ON jobs(node_id);

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY NOT NULL,
      job_id TEXT,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      local_path TEXT NOT NULL,
      source_url TEXT,
      sha256 TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      original_file_name TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS assets_sha_bytes_idx ON assets(sha256, bytes);
    CREATE INDEX IF NOT EXISTS assets_job_id_idx ON assets(job_id);
  `);

  sqlite.close();
  initialized = true;
}
