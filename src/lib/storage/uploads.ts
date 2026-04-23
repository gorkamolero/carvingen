import { extname } from "node:path";

import heicConvert from "heic-convert";
import { lookup } from "mime-types";

import { ALLOWED_UPLOAD_MIME_TYPES, getServerEnv, type AllowedUploadMimeType } from "@/lib/env";
import { ApiError } from "@/lib/http/errors";

export type NormalizedUpload = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
};

export async function normalizeUpload(file: File): Promise<NormalizedUpload> {
  const env = getServerEnv();
  if (file.size > env.MAX_UPLOAD_BYTES) {
    throw new ApiError(413, "Upload exceeds the 25 MB limit.");
  }

  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type as AllowedUploadMimeType)) {
    throw new ApiError(415, "Unsupported image type.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (file.type === "image/heic") {
    const output = await heicConvert({
      buffer,
      format: "JPEG",
      quality: 0.9,
    });

    return {
      buffer: Buffer.from(output),
      mimeType: "image/jpeg",
      extension: ".jpg",
    };
  }

  const extension = extname(file.name) || `.${lookup(file.type) ?? "bin"}`;
  return {
    buffer,
    mimeType: file.type,
    extension,
  };
}
