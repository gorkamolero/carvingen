import { resolve } from "node:path";
export function parseCaptureArgs(args: string[]) {
  const [projectId, ...rest] = args;
  if (!projectId || projectId.startsWith("-") || !/^[\w-]+$/.test(projectId)) throw new Error("Usage: pnpm capture <projectId> [--out dir] [--base-url URL] [--seconds 16]");
  let out = resolve("outputs/capture", projectId), baseUrl = "http://127.0.0.1:3001", seconds = 16;
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i], value = rest[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--out") out = resolve(value);
    else if (flag === "--base-url") { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid base URL"); baseUrl = url.origin; }
    else if (flag === "--seconds") { seconds = Number(value); if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new Error("Seconds must be >0 and <=300"); }
    else throw new Error(`Unknown option ${flag}`);
  }
  return { projectId, out, baseUrl, seconds };
}
