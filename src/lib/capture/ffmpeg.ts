import { CaptureUnavailableError } from "./errors";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export async function convertVideo(input: string, output: string, seconds?: number, start = 0) {
  await exec("ffmpeg", ["-y", "-ss", String(start), "-i", input, ...(seconds ? ["-t", String(seconds)] : []), "-an", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { maxBuffer: 2 * 1024 * 1024 });
  if (seconds) {
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", output]);
    if (Number(stdout.trim()) < seconds - 0.05) throw new Error("Recording ended early. Retry capture with less system load.");
  }

}

/** Locate the deliberate loading cover in the actual recording timeline. */
export async function loadingTrim(input: string) {
  const { stderr } = await exec("ffmpeg", ["-i", input, "-vf", "blackdetect=d=0.1:pix_th=0.1:pic_th=0.98", "-an", "-f", "null", "-"], { maxBuffer: 2 * 1024 * 1024 });
  const ends = [...stderr.matchAll(/black_end:([\d.]+)/g)];
  if (!ends.length) throw new Error("Unable to identify the loading cover in the recording.");
  return Number(ends[0][1]) + 0.08;
}

export async function requireVideoTools() {
  for (const tool of ["ffmpeg", "ffprobe"]) {
    try { await exec(tool, ["-version"]); } catch { throw new CaptureUnavailableError("FFMPEG_UNAVAILABLE", `${tool} is unavailable. Install ffmpeg to record MP4 captures.`); }
  }
}
