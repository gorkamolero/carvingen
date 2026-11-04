import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseBlenderProgress } from "./progress";

// Binding prevents the bundler from treating runtime CLI arguments as files to trace.
// Python scripts are included explicitly by next.config.ts.
const launchBlender = spawn.bind(null);

export type BlenderResult = { files: { name: string; kind: string; path: string }[]; triangleCount?: number; boneNames?: string[]; budgetPass?: boolean; clips?: unknown[] };
export async function runBlender(script: "bake" | "retarget" | "export" | "recentre", args: Record<string, unknown>, directory: string,
  onProgress: (progress: number, status: string) => void = () => {}) {
  await mkdir(directory, { recursive: true });
  const config = join(directory, "input.json");
  await writeFile(config, JSON.stringify({ ...args, output: directory }));
  await new Promise<void>((ok, fail) => {
    const child = launchBlender(process.env.BLENDER_PATH || "/opt/homebrew/bin/blender", ["-b", "--factory-startup", "--python-exit-code", "1", "-P", `scripts/blender/${script}.py`, "--", config], { stdio: ["ignore", "pipe", "pipe"] });
    let pending = "", tail = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); fail(new Error("Blender exceeded the 30 minute limit.")); }, 30 * 60 * 1000);
    child.stdout.on("data", (chunk: Buffer) => {
      pending += chunk.toString(); tail = (tail + chunk.toString()).slice(-6000);
      const lines = pending.split(/\r?\n/); pending = lines.pop() ?? "";
      for (const line of lines) { const p = parseBlenderProgress(line); if (p) onProgress(p.progress, p.status); }
    });
    child.stderr.on("data", (chunk: Buffer) => { tail = (tail + chunk.toString()).slice(-6000); });
    child.on("error", (error: NodeJS.ErrnoException) => { clearTimeout(timer); fail(new Error(error.code === "ENOENT" ? "Blender was not found. Set BLENDER_PATH or install Blender at /opt/homebrew/bin/blender." : error.message)); });
    child.on("close", (code) => { clearTimeout(timer); if (code === 0) ok(); else fail(new Error(`Blender failed (${code}): ${tail}`)); });
  });
  return JSON.parse(await readFile(/* turbopackIgnore: true */ join(directory, "result.json"), "utf8")) as BlenderResult;
}
