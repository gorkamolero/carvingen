import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

// Keep the bundler from tracing runtime CLI arguments as project files.
const launchCodex = spawn.bind(null);

const state = globalThis as typeof globalThis & { codexImageQueue?: { running: number; waiting: Array<() => void> } };
const queue = state.codexImageQueue ??= { running: 0, waiting: [] };
export const CODEX_IMAGE_TIMEOUT_MS = 10 * 60 * 1000;
export type CodexImageInput = { prompt: string; referencePaths?: string[]; aspectRatio: string; workDir: string };

export async function generateCodexImage({ prompt, referencePaths = [], aspectRatio, workDir }: CodexImageInput): Promise<string> {
  if (referencePaths.length > 10) throw new Error("Codex supports at most 10 reference images.");
  if (!["1:1", "3:4", "4:3", "9:16", "16:9"].includes(aspectRatio)) throw new Error("Unsupported Codex aspect ratio.");
  if (queue.running >= 2) await new Promise<void>((resolve) => queue.waiting.push(resolve));
  else queue.running++;
  try {
    const directory = resolve(workDir);
    await mkdir(directory, { recursive: true });
    if ((await readdir(directory)).length) throw new Error("Codex work directory must be empty.");
    const refs = await Promise.all(referencePaths.map(async (path, i) => {
      const target = join(directory, `reference-${i}${extname(path) || ".png"}`);
      await copyFile(path, target); return target;
    }));
    const orientation = aspectRatio === "1:1" ? "Square" : ["3:4", "9:16"].includes(aspectRatio) ? "Portrait" : "Landscape";
    const instruction = `Use your built-in image generation tool (image_gen) to make ONE image${refs.length ? " editing from the attached references" : ""}. ${orientation} ${aspectRatio}.\n${prompt}\nSave the result as output.png in the current folder (only that file). Do not do anything else.`;
    const log = createWriteStream(join(directory, "codex.log"));
    let tail = "";
    const append = (chunk: Buffer) => { log.write(chunk); tail = (tail + chunk.toString()).slice(-4000); };
    try {
      await new Promise<void>((resolve, reject) => {
        const child = launchCodex(process.env.CODEX_PATH || "codex", ["exec", "--skip-git-repo-check", "-s", "workspace-write", "--enable", "image_generation", "-C", directory, "-o", join(directory, "last.txt"), ...refs.flatMap((p) => ["-i", p]), "-"], { shell: false, cwd: directory, stdio: ["pipe", "pipe", "pipe"] });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, CODEX_IMAGE_TIMEOUT_MS);
        child.stdout.on("data", append); child.stderr.on("data", append);
        child.stdin.on("error", () => { /* Process failure is reported by error/close. */ });
        child.once("error", (error: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          reject(new Error(error.code === "ENOENT" ? "Codex CLI not found; install it and sign in with your ChatGPT account" : error.message));
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          if (timedOut) reject(new Error(`Codex image timed out after 10 minutes.\n${tail}`));
          else if (code !== 0) reject(new Error(`Codex exited with code ${code}.\n${tail}`));
          else resolve();
        });
        child.stdin.end(instruction);
      });
      const output = join(directory, "output.png");
      const bytes = await readFile(output).catch(() => { throw new Error(`Codex did not create output.png.\n${tail}`); });
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`Codex output is not a PNG.\n${tail}`);
      return output;
    } finally { await new Promise<void>((resolve) => log.end(resolve)); }
  } finally {
    const next = queue.waiting.shift();
    if (next) next(); else queue.running--;
  }
}
