import { resolve } from "node:path";

import { z } from "zod";

const serverEnvSchema = z.object({
  FAL_KEY: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  PUBLIC_URL: z.url("PUBLIC_URL must be an absolute URL."),
  ASSET_STORAGE_PATH: z.string().min(1).default("./outputs"),
  DATABASE_PATH: z.string().min(1).default("./carvingen.sqlite"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
});

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  ASSET_STORAGE_PATH: string;
  DATABASE_PATH: string;
};

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = serverEnvSchema.safeParse({
    FAL_KEY: process.env.FAL_KEY,
    PUBLIC_URL: process.env.PUBLIC_URL ?? "http://localhost:3001",
    ASSET_STORAGE_PATH: process.env.ASSET_STORAGE_PATH ?? "./outputs",
    DATABASE_PATH: process.env.DATABASE_PATH ?? "./carvingen.sqlite",
    MAX_UPLOAD_BYTES: process.env.MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));
  }

  cachedEnv = {
    ...parsed.data,
    ASSET_STORAGE_PATH: resolve(
      /* turbopackIgnore: true */ process.cwd(),
      parsed.data.ASSET_STORAGE_PATH,
    ),
    DATABASE_PATH: resolve(
      /* turbopackIgnore: true */ process.cwd(),
      parsed.data.DATABASE_PATH,
    ),
  };

  return cachedEnv;
}

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export function getFalKey() {
  const env = getServerEnv();
  if (!env.FAL_KEY) {
    throw new Error("FAL_KEY is required for image and mesh generation.");
  }

  return env.FAL_KEY;
}
