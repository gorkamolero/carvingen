import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/lib/db/client";
import { ensureDatabase } from "@/lib/db/init";
import { assets } from "@/lib/db/schema";
import { getPublicAssetUrl } from "@/lib/server/public-url";

export type AssetRecordInput = {
  id?: string;
  jobId?: string | null;
  kind: string;
  mimeType: string;
  localPath: string;
  sourceUrl?: string | null;
  sha256: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  originalFileName?: string | null;
};

export async function createAssetRecord(input: AssetRecordInput) {
  ensureDatabase();

  const id = input.id ?? nanoid();
  await db.insert(assets).values({
    id,
    jobId: input.jobId ?? null,
    kind: input.kind,
    mimeType: input.mimeType,
    localPath: input.localPath,
    sourceUrl: input.sourceUrl ?? null,
    sha256: input.sha256,
    bytes: input.bytes,
    width: input.width ?? null,
    height: input.height ?? null,
    originalFileName: input.originalFileName ?? null,
    createdAt: new Date(),
  });

  return getAssetById(id);
}

export async function getAssetById(id: string) {
  ensureDatabase();
  const record = await db.query.assets.findFirst({
    where: eq(assets.id, id),
  });

  if (!record) {
    return null;
  }

  return {
    ...record,
    url: getPublicAssetUrl(record.id),
  };
}

export async function getAssetBySha(sha256: string, bytes: number) {
  ensureDatabase();
  const record = await db.query.assets.findFirst({
    where: and(eq(assets.sha256, sha256), eq(assets.bytes, bytes)),
  });

  if (!record) {
    return null;
  }

  return {
    ...record,
    url: getPublicAssetUrl(record.id),
  };
}
