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

  const animationExt = extname(file.name).toLowerCase();
  if ([".fbx", ".bvh", ".glb"].includes(animationExt)) {
    if (!["", "application/octet-stream", "application/vnd.autodesk.fbx", "model/gltf-binary", "text/plain"].includes(file.type)) throw new ApiError(415, "Invalid animation MIME type.");
    const buffer = Buffer.from(await file.arrayBuffer());
    const header = buffer.subarray(0, 256).toString("utf8");
    const valid = animationExt === ".glb" ? buffer.length >= 20 && buffer.toString("ascii", 0, 4) === "glTF" && buffer.readUInt32LE(4) === 2 && buffer.readUInt32LE(8) === buffer.length
      : animationExt === ".bvh" ? /^\s*HIERARCHY\s+ROOT\s/.test(header)
      : header.startsWith("Kaydara FBX Binary") || /^;.*FBX/.test(header);
    if (!valid) throw new ApiError(415, "File contents do not match the animation extension.");
    return { buffer, mimeType: animationExt === ".glb" ? "model/gltf-binary" : "application/octet-stream", extension: animationExt };
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
