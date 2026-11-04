import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
const launch = spawn.bind(null);
const runtimePath = resolve.bind(null);
// The venv is created at runtime and can contain interpreter symlinks outside the checkout.
// Do not let the server bundler recursively trace it as a deployment asset.
const runtimeFiles = { access: access.bind(null), mkdir: mkdir.bind(null), readFile: readFile.bind(null), writeFile: writeFile.bind(null) };
export async function motionCommand(binary: string, args: string[], onProgress: (line: string) => void, env: NodeJS.ProcessEnv = process.env) {
  await new Promise<void>((ok, fail) => {
    const child = launch(binary, args, { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { child.kill("SIGKILL"); fail(new Error("Motion setup exceeded 30 minutes")); }, 1800000);
    for (const stream of [child.stdout, child.stderr]) {
      let pending = "";
      stream.on("data", (chunk: Buffer) => { pending += chunk.toString(); const lines = pending.split(/\r?\n/); pending = lines.pop() ?? ""; for (const line of lines) onProgress(line); });
    }
    child.on("error", (e) => { clearTimeout(timer); fail(e); });
    child.on("close", (code) => { clearTimeout(timer); if (code === 0) ok(); else fail(new Error(`Motion setup command failed (${code})`)); });
  });
}
let pending: Promise<string> | undefined;
export function ensureMotionPython(onProgress: (line: string) => void = () => {}): Promise<string> {
  pending ??= setup(onProgress).finally(() => { pending = undefined; });
  return pending;
}
async function setup(onProgress: (line: string) => void) {
  if (process.env.MOTION_PYTHON) { await runtimeFiles.access(process.env.MOTION_PYTHON); return process.env.MOTION_PYTHON; }
  const directory = runtimePath(".venv-motion"), python = join(directory, "bin/python");
  const requirements = runtimePath("scripts/motion/requirements.txt");
  const hash = createHash("sha256").update(await runtimeFiles.readFile(requirements)).digest("hex");
  const stamp = join(directory, ".requirements.sha256");
  try { await runtimeFiles.access(python); if ((await runtimeFiles.readFile(stamp, "utf8")) === hash) return python; } catch { /* First setup. */ }
  onProgress("Python environment");
  // Keep downloads in the user's cache, never in tracked directories.
  for (const uv of ["/opt/homebrew/bin/uv", "uv"]) {
    try {
      await motionCommand(uv, ["venv", "--python", "3.12", directory], onProgress);
      await motionCommand(uv, ["pip", "install", "-r", requirements], onProgress, { ...process.env, VIRTUAL_ENV: directory });
      await runtimeFiles.writeFile(stamp, hash); return python;
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
  await runtimeFiles.mkdir(directory, { recursive: true });
  await motionCommand("python3.12", ["-m", "venv", directory], onProgress);
  await motionCommand(python, ["-m", "pip", "install", "-r", requirements], onProgress);
  await runtimeFiles.writeFile(stamp, hash); return python;
}
