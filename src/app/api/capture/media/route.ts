import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { convertVideo } from "@/lib/capture/ffmpeg";
import { createAssetRecord, getAssetBySha } from "@/lib/db/repositories/assets";
import { buildAssetPath } from "@/lib/storage/paths";
import { writeFileIfMissing } from "@/lib/storage/files";
import { sha256 } from "@/lib/storage/hash";
import { ApiError } from "@/lib/http/errors";
import { jsonError, jsonOk } from "@/lib/http/json";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let temporary: string | undefined;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 100 * 1024 * 1024) throw new ApiError(400, "Capture file required (maximum 100 MB).");
    let buffer = Buffer.from(await file.arrayBuffer()), mimeType = file.type, extension = "png";
    let conversionWarning: string | undefined;
    if (mimeType === "image/png") { buffer = await sharp(buffer).png().toBuffer(); }
    else if (mimeType.startsWith("video/webm")) {
      if (buffer.subarray(0, 4).toString("hex") !== "1a45dfa3") throw new ApiError(400, "Invalid WebM.");
      temporary = await mkdtemp(join(tmpdir(), "carvingen-record-"));
      const input = join(temporary, "input.webm"), output = join(temporary, "output.mp4");
      await writeFile(input, buffer);
      try { await convertVideo(input, output); buffer = await readFile(output); mimeType = "video/mp4"; extension = "mp4"; }
      catch { mimeType = "video/webm"; extension = "webm"; conversionWarning = "MP4 conversion unavailable. Original WebM saved."; }
    } else throw new ApiError(415, "PNG or WebM capture required.");
    const hash = sha256(buffer);
    const existing = await getAssetBySha(hash, buffer.length);
    const localPath = buildAssetPath("capture", `${hash}.${extension}`);
    await writeFileIfMissing(localPath, buffer);
    const asset = existing ?? await createAssetRecord({ kind: extension === "png" ? "image" : "video", mimeType, localPath, sha256: hash, bytes: buffer.length, originalFileName: `capture.${extension}` });
    return jsonOk({ assetId: asset!.id, extension, conversionWarning });
  } catch (e) { return jsonError(e); }
  finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
}
