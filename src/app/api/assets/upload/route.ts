import { extension } from "mime-types";
import { nanoid } from "nanoid";

import { createAssetRecord, getAssetBySha } from "@/lib/db/repositories/assets";
import { jsonError, jsonOk } from "@/lib/http/json";
import { readFileBuffer, writeFileIfMissing } from "@/lib/storage/files";
import { sha256 } from "@/lib/storage/hash";
import { buildAssetPath } from "@/lib/storage/paths";
import { normalizeUpload } from "@/lib/storage/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("file is required.");
    }

    const normalized = await normalizeUpload(file);
    const hash = sha256(normalized.buffer);
    const existing = await getAssetBySha(hash, normalized.buffer.byteLength);

    if (existing) {
      return jsonOk({
        assetId: existing.id,
        url: existing.url,
        width: existing.width,
        height: existing.height,
        bytes: existing.bytes,
      });
    }

    const ext = normalized.extension || `.${extension(normalized.mimeType) ?? "bin"}`;
    const localPath = buildAssetPath("image-upload", `${hash}${ext}`);

    await writeFileIfMissing(localPath, normalized.buffer);
    await readFileBuffer(localPath);

    const asset = await createAssetRecord({
      id: nanoid(),
      kind: "image",
      mimeType: normalized.mimeType,
      localPath,
      sourceUrl: null,
      sha256: hash,
      bytes: normalized.buffer.byteLength,
      originalFileName: file.name,
      width: null,
      height: null,
    });

    return jsonOk({
      assetId: asset?.id,
      url: asset?.url,
      width: asset?.width,
      height: asset?.height,
      bytes: asset?.bytes,
    });
  } catch (error) {
    return jsonError(error);
  }
}
