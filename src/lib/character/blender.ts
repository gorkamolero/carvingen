import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseBlenderProgress } from "./progress";

// Binding prevents the bundler from treating runtime CLI arguments as files to trace.
// Python scripts are included explicitly by next.config.ts.
const launchBlender = spawn.bind(null);

export type BlenderResult = { files: { name: string; kind: string; path: string }[]; triangleCount?: number; boneNames?: string[]; budgetPass?: boolean; clips?: unknown[] };
export async function runBlender(script: "bake" | "retarget" | "export" | "recentre", args: Record<string, unknown>, directory: string,
  onProgress: (progress: number, status: string) => void = () => {}) {
  return runCharacterProcess(process.env.BLENDER_PATH || "/opt/homebrew/bin/blender", ["-b", "--factory-startup", "--python-exit-code", "1", "-P", `scripts/blender/${script}.py`, "--"], args, directory, onProgress) as Promise<BlenderResult>;
}
export async function runMotionStage(script: "reference" | "prompt" | "read" | "gates" | "solve" | "apply" | "verify" | "exam", args: Record<string, unknown>, directory: string, python: string, creature: string, onProgress: (progress: number, status: string) => void = () => {}) {
  const blender = ["reference", "apply", "verify", "exam"].includes(script);
  return runCharacterProcess(blender ? process.env.BLENDER_PATH || "/opt/homebrew/bin/blender" : python,
    blender ? ["-b", "--factory-startup", "--python-exit-code", "1", "-P", `scripts/motion/${script}.py`, "--"] : [`scripts/motion/${script}.py`], args, directory, onProgress, creature);
}
async function runCharacterProcess(binary: string, argv: string[], args: Record<string, unknown>, directory: string, onProgress: (progress: number, status: string) => void, creature?: string): Promise<Record<string, unknown> & BlenderResult> {
  directory = resolve(directory);
  await mkdir(directory, { recursive: true });
  const config = join(directory, "input.json");
  await writeFile(config, JSON.stringify({ ...args, output: directory }));
  await new Promise<void>((ok, fail) => {
    const child = launchBlender(binary, [...argv, config], { cwd: process.cwd(), env: { ...process.env, OMP_NUM_THREADS: "2", MKL_NUM_THREADS: "2", PYTHONDONTWRITEBYTECODE: "1", ...(creature ? { MOCAP_CREATURE: resolve(creature) } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
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
  return JSON.parse(await readFile(/* turbopackIgnore: true */ join(directory, "result.json"), "utf8")) as Record<string, unknown> & BlenderResult;
}
