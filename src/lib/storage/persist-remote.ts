import { extension } from "mime-types";
import { nanoid } from "nanoid";

import { createAssetRecord, getAssetBySha } from "@/lib/db/repositories/assets";
import { buildAssetPath } from "@/lib/storage/paths";
import { sha256 } from "@/lib/storage/hash";
import { writeFileIfMissing } from "@/lib/storage/files";

export async function persistRemoteAsset(input: {
  sourceUrl: string;
  kind: string;
  jobId?: string | null;
}) {
  const response = await fetch(input.sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch remote asset: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const hash = sha256(buffer);
  const ext = extension(mimeType) || input.kind;
  const existing = await getAssetBySha(hash, buffer.byteLength);

  if (existing) {
    return existing;
  }

  const localPath = buildAssetPath(input.kind, `${hash}.${ext}`);
  await writeFileIfMissing(localPath, buffer);

  return createAssetRecord({
    id: nanoid(),
    jobId: input.jobId ?? null,
    kind: input.kind,
    mimeType,
    localPath,
    sourceUrl: input.sourceUrl,
    sha256: hash,
    bytes: buffer.byteLength,
    width: null,
    height: null,
    originalFileName: null,
  });
}
